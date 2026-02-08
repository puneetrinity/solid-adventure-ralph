import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { RunRecorder } from '@arch-orchestrator/core';

@Processor('evaluate_policy')
export class EvaluatePolicyProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(EvaluatePolicyProcessor.name);

  constructor(
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<{ workflowId: string; patchSetId: string }>) {
    const { workflowId, patchSetId } = job.data;

    this.logger.log(`Evaluating policy for workflow ${workflowId}, patchSet ${patchSetId}`);

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'evaluate_policy',
      inputs: { workflowId, patchSetId }
    });

    try {
      // Get patch set with patches
      const patchSet = await this.prisma.patchSet.findUnique({
        where: { id: patchSetId },
        include: { patches: true }
      });

      if (!patchSet) {
        throw new Error(`PatchSet ${patchSetId} not found`);
      }

      if (patchSet.workflowId !== workflowId) {
        throw new Error(`PatchSet ${patchSetId} does not belong to workflow ${workflowId}`);
      }

      // Phase 4: Simple policy evaluation
      // For now, check basic rules:
      // 1. No patches that modify sensitive files (.env, secrets, credentials)
      // 2. No patches with high risk level
      const violations: { rule: string; message: string; blocking: boolean; file: string }[] = [];

      for (const patch of patchSet.patches) {
        const files = patch.files as { path: string }[];

        // Check for sensitive file modifications
        for (const file of files) {
          if (this.isSensitiveFile(file.path)) {
            violations.push({
              rule: 'NO_SENSITIVE_FILES',
              message: `Patch modifies sensitive file: ${file.path}`,
              blocking: true,
              file: file.path
            });
          }
        }

        // Check risk level
        if (patch.riskLevel === 'high') {
          violations.push({
            rule: 'HIGH_RISK_WARNING',
            message: `Patch "${patch.title}" has high risk level`,
            blocking: false, // warning only
            file: `patch:${patch.title}`
          });
        }
      }

      const hasBlockingViolations = violations.some(v => v.blocking);
      const warningCount = violations.filter(v => !v.blocking).length;

      this.logger.log(
        `Policy evaluation complete: ${violations.length} violations ` +
        `(${hasBlockingViolations ? 'BLOCKED' : 'PASSED'}, ${warningCount} warnings)`
      );

      // Replace previous policy violations for this patch set (if any)
      await this.prisma.policyViolation.deleteMany({
        where: { patchSetId }
      });

      if (violations.length > 0) {
        await this.prisma.policyViolation.createMany({
          data: violations.map(v => ({
            workflowId,
            patchSetId,
            rule: v.rule,
            severity: v.blocking ? 'BLOCK' : 'WARN',
            file: v.file,
            message: v.message,
            line: null,
            evidence: null
          }))
        });
      }

      // Record evaluation result
      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.evaluate_policy.completed',
          payload: {
            patchSetId,
            violations,
            hasBlockingViolations,
            warningCount
          }
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { hasBlockingViolations, violations }
      });

      // Emit result to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_POLICY_EVALUATED',
          result: { hasBlockingViolations, violations }
        }
      });

      return { ok: true, hasBlockingViolations, violations };
    } catch (error: any) {
      const errorMsg = String(error?.message ?? error);
      this.logger.error(`Policy evaluation failed: ${errorMsg}`);

      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.evaluate_policy.failed',
          payload: { patchSetId, error: errorMsg }
        }
      });

      // Emit failure event - treat as non-blocking to allow manual override
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_POLICY_EVALUATED',
          result: { hasBlockingViolations: false, error: errorMsg }
        }
      });

      return { ok: false, error: errorMsg };
    }
  }

  private isSensitiveFile(path: string): boolean {
    const sensitivePatterns = [
      /\.env$/i,
      /\.env\./i,
      /secrets?\./i,
      /credentials?\./i,
      /private[_-]?key/i,
      /\.pem$/i,
      /\.key$/i,
      /password/i,
    ];

    return sensitivePatterns.some(pattern => pattern.test(path));
  }
}

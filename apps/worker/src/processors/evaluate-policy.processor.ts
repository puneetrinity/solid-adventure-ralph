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

      // Policy evaluation rules
      const violations: { rule: string; message: string; blocking: boolean; file: string; evidence?: string }[] = [];

      for (const patch of patchSet.patches) {
        const files = patch.files as { path: string }[];
        const diff = patch.diff as string || '';

        for (const file of files) {
          // Rule 1: Sensitive files (blocking)
          if (this.isSensitiveFile(file.path)) {
            violations.push({
              rule: 'NO_SENSITIVE_FILES',
              message: `Patch modifies sensitive file: ${file.path}`,
              blocking: true,
              file: file.path
            });
          }

          // Rule 2: Frozen files (blocking)
          if (this.isFrozenFile(file.path)) {
            violations.push({
              rule: 'FROZEN_FILE',
              message: `File is frozen and should not be modified: ${file.path}`,
              blocking: true,
              file: file.path
            });
          }

          // Rule 3: Deny-glob patterns (blocking)
          const denyMatch = this.matchesDenyGlob(file.path);
          if (denyMatch) {
            violations.push({
              rule: 'DENY_GLOB',
              message: `File matches denied pattern "${denyMatch}": ${file.path}`,
              blocking: true,
              file: file.path
            });
          }
        }

        // Rule 4: Secret scanning in diff content (blocking)
        const secrets = this.scanForSecrets(diff);
        for (const secret of secrets) {
          violations.push({
            rule: 'SECRET_DETECTED',
            message: `Potential ${secret.type} detected in patch`,
            blocking: true,
            file: patch.title || 'unknown',
            evidence: secret.match.substring(0, 50) + (secret.match.length > 50 ? '...' : '')
          });
        }

        // Rule 5: High risk level (warning)
        if (patch.riskLevel === 'high') {
          violations.push({
            rule: 'HIGH_RISK_WARNING',
            message: `Patch "${patch.title}" has high risk level`,
            blocking: false,
            file: `patch:${patch.title}`
          });
        }

        // Rule 6: Large diff warning
        if (diff.length > 10000) {
          violations.push({
            rule: 'LARGE_DIFF_WARNING',
            message: `Patch has a large diff (${Math.round(diff.length / 1000)}KB) - review carefully`,
            blocking: false,
            file: patch.title || 'unknown'
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
            evidence: v.evidence || null
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

  private isFrozenFile(path: string): boolean {
    const frozenFiles = [
      'LICENSE',
      'LICENSE.md',
      'LICENSE.txt',
      'LICENCE',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Cargo.lock',
      'poetry.lock',
      'Gemfile.lock',
      'composer.lock',
      '.gitignore',
      '.gitattributes',
    ];

    const fileName = path.split('/').pop() || '';
    return frozenFiles.includes(fileName);
  }

  private matchesDenyGlob(path: string): string | null {
    // Patterns that should never be modified by automated tools
    const denyPatterns = [
      { pattern: /^\.github\/workflows\//, name: '.github/workflows/*' },
      { pattern: /^\.github\/CODEOWNERS$/, name: 'CODEOWNERS' },
      { pattern: /dockerfile/i, name: 'Dockerfile' },
      { pattern: /docker-compose/i, name: 'docker-compose' },
      { pattern: /^\.dockerignore$/, name: '.dockerignore' },
      { pattern: /^Makefile$/, name: 'Makefile' },
      { pattern: /^\.gitlab-ci\.yml$/, name: '.gitlab-ci.yml' },
      { pattern: /^\.travis\.yml$/, name: '.travis.yml' },
      { pattern: /^Jenkinsfile$/, name: 'Jenkinsfile' },
    ];

    for (const { pattern, name } of denyPatterns) {
      if (pattern.test(path)) {
        return name;
      }
    }
    return null;
  }

  private scanForSecrets(content: string): { type: string; match: string }[] {
    const secrets: { type: string; match: string }[] = [];

    const secretPatterns = [
      // API Keys
      { type: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
      { type: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}(?=\s|$|"|')/g },
      { type: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
      { type: 'Slack Token', pattern: /xox[baprs]-[0-9a-zA-Z-]+/g },
      { type: 'Stripe Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/g },
      { type: 'Stripe Key', pattern: /pk_live_[0-9a-zA-Z]{24,}/g },

      // Generic patterns
      { type: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
      { type: 'API Key', pattern: /api[_-]?key['":\s]*[=:]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/gi },
      { type: 'Secret', pattern: /secret['":\s]*[=:]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/gi },
      { type: 'Password', pattern: /password['":\s]*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi },
      { type: 'Bearer Token', pattern: /bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi },

      // Database URLs with passwords
      { type: 'Database URL', pattern: /(postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/gi },
    ];

    // Only scan added lines (lines starting with +)
    const addedLines = content.split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .join('\n');

    for (const { type, pattern } of secretPatterns) {
      const matches = addedLines.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Avoid false positives for common placeholders
          if (!this.isPlaceholder(match)) {
            secrets.push({ type, match });
          }
        }
      }
    }

    return secrets;
  }

  private isPlaceholder(value: string): boolean {
    const placeholders = [
      /^your[_-]?/i,
      /^my[_-]?/i,
      /^xxx+$/i,
      /^placeholder$/i,
      /^example$/i,
      /^test$/i,
      /^fake$/i,
      /^dummy$/i,
      /^<[^>]+>$/,
      /^\$\{[^}]+\}$/,
      /^\{\{[^}]+\}\}$/,
    ];

    return placeholders.some(p => p.test(value));
  }
}

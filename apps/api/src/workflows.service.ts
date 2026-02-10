import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';

interface ListParams {
  limit: number;
  cursor?: string;
  status?: string;
  repoOwner?: string;
  repoName?: string;
}

interface WorkflowListItem {
  id: string;
  state: string;
  title: string | null;
  repoOwner: string | null;
  repoName: string | null;
  baseBranch: string;
  createdAt: Date;
  baseSha: string | null;
  repos?: Array<{
    id: string;
    owner: string;
    repo: string;
    baseBranch: string;
    role: string;
  }>;
}

export interface ListResult {
  items: WorkflowListItem[];
  nextCursor: string | null;
}

@Injectable()
export class WorkflowsService {
  private prisma = getPrisma();

  constructor(
    @InjectQueue('workflow') private readonly workflowQueue: Queue,
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {}

  async list(params: ListParams): Promise<ListResult> {
    const { limit, cursor, status, repoOwner, repoName } = params;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) {
      where.state = status;
    }
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    // Filter by repo membership (either primary repo or any repo in workflow)
    if (repoOwner && repoName) {
      where.OR = [
        // Legacy fields match
        { repoOwner, repoName },
        // Or any repo in the workflow matches
        { repos: { some: { owner: repoOwner, repo: repoName } } }
      ];
    } else if (repoOwner) {
      where.OR = [
        { repoOwner },
        { repos: { some: { owner: repoOwner } } }
      ];
    }

    // Fetch one extra to determine if there's a next page
    const workflows = await this.prisma.workflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        state: true,
        title: true,
        repoOwner: true,
        repoName: true,
        baseBranch: true,
        createdAt: true,
        baseSha: true,
        repos: {
          select: {
            id: true,
            owner: true,
            repo: true,
            baseBranch: true,
            role: true,
          },
          orderBy: { createdAt: 'asc' }
        }
      },
    });

    const hasMore = workflows.length > limit;
    const items = hasMore ? workflows.slice(0, limit) : workflows;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor };
  }

  async create(params: {
    featureGoal?: string;
    businessJustification?: string;
    goal?: string;  // Legacy
    context?: string;
    title?: string;
    repos?: Array<{ owner: string; repo: string; baseBranch?: string; role?: string }>;
    repoOwner?: string;
    repoName?: string;
    baseBranch?: string;
  }) {
    const { featureGoal, businessJustification, goal, context, title, repos, repoOwner, repoName, baseBranch } = params;

    // Use featureGoal if provided, otherwise fall back to legacy goal
    const effectiveGoal = featureGoal || goal;

    // Validate goal is provided
    if (!effectiveGoal?.trim()) {
      throw new BadRequestException('featureGoal is required');
    }

    // Handle repos array or legacy single-repo fields
    let repoList = repos || [];
    if (repoList.length === 0 && repoOwner && repoName) {
      // Legacy mode: single repo
      repoList = [{ owner: repoOwner, repo: repoName, baseBranch: baseBranch || 'main', role: 'primary' }];
    }

    // Validate at least one repo
    if (repoList.length === 0) {
      throw new BadRequestException('At least one repository is required (use repos array or repoOwner/repoName)');
    }

    // Validate exactly one primary repo
    const primaryRepos = repoList.filter(r => (r.role || 'primary') === 'primary');
    if (primaryRepos.length === 0) {
      // Default first repo to primary
      repoList[0].role = 'primary';
    } else if (primaryRepos.length > 1) {
      throw new BadRequestException('Exactly one repository must have role "primary"');
    }

    // Use primary repo for legacy fields
    const primaryRepo = repoList.find(r => r.role === 'primary') || repoList[0];

    const workflow = await this.prisma.workflow.create({
      data: {
        state: 'INTAKE',  // New initial state for gated pipeline
        // New gated workflow fields
        featureGoal: featureGoal || null,
        businessJustification: businessJustification || null,
        // Stage tracking
        stage: 'feasibility',
        stageStatus: 'pending',
        stageUpdatedAt: new Date(),
        // Legacy fields
        goal: effectiveGoal,
        context: context || null,
        title: title || effectiveGoal.substring(0, 100),
        // Legacy repo fields for backwards compat
        repoOwner: primaryRepo.owner,
        repoName: primaryRepo.repo,
        baseBranch: primaryRepo.baseBranch || 'main',
      }
    });

    // Create WorkflowRepo entries
    for (const repo of repoList) {
      await this.prisma.workflowRepo.create({
        data: {
          workflowId: workflow.id,
          owner: repo.owner,
          repo: repo.repo,
          baseBranch: repo.baseBranch || 'main',
          role: repo.role || 'primary',
        }
      });
    }

    await this.prisma.workflowEvent.create({
      data: {
        workflowId: workflow.id,
        type: 'ui.create',
        payload: { featureGoal, businessJustification, goal: effectiveGoal, context, title, repos: repoList }
      }
    });

    // Emit event to orchestrator to start feasibility analysis
    await this.orchestrateQueue.add('orchestrate', {
      workflowId: workflow.id,
      event: { type: 'E_WORKFLOW_CREATED' }
    });

    return {
      id: workflow.id,
      state: workflow.state,
      stage: workflow.stage,
      stageStatus: workflow.stageStatus,
      featureGoal: workflow.featureGoal,
      businessJustification: workflow.businessJustification,
      goal: workflow.goal,
      context: workflow.context,
      title: workflow.title,
      repoOwner: workflow.repoOwner,
      repoName: workflow.repoName,
      baseBranch: workflow.baseBranch,
      repos: repoList,
    };
  }

  async get(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        repos: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        artifacts: { orderBy: { createdAt: 'asc' } },
        patchSets: {
          orderBy: { createdAt: 'desc' },
          include: { patches: { orderBy: { createdAt: 'asc' } } }
        },
        approvals: { orderBy: { createdAt: 'asc' } },
        pullRequests: { orderBy: { createdAt: 'desc' } },
        runs: { orderBy: { startedAt: 'desc' } },
        policyViolations: { orderBy: { createdAt: 'asc' } },
        stageDecisions: { orderBy: { createdAt: 'asc' } },
        tasks: { orderBy: { taskId: 'asc' } }
      }
    });

    return workflow ?? null;
  }

  async getTasks(workflowId: string) {
    const tasks = await this.prisma.workflowTask.findMany({
      where: { workflowId },
      orderBy: { taskId: 'asc' }
    });

    return tasks;
  }

  async getCostSummary(workflowId: string) {
    const runs = await this.prisma.workflowRun.findMany({
      where: { workflowId },
      select: {
        jobName: true,
        agentRole: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
        durationMs: true,
        startedAt: true,
        status: true
      },
      orderBy: { startedAt: 'asc' }
    });

    // Aggregate by job/role
    const byJob: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number; count: number; durationMs: number }> = {};
    const byRole: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number; count: number; durationMs: number }> = {};

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const run of runs) {
      const input = run.inputTokens || 0;
      const output = run.outputTokens || 0;
      const tokens = run.totalTokens || 0;
      const cost = run.estimatedCost || 0;
      const duration = run.durationMs || 0;

      totalInputTokens += input;
      totalOutputTokens += output;
      totalTokens += tokens;
      totalCost += cost;
      totalDuration += duration;

      if (run.status === 'completed') successCount++;
      if (run.status === 'failed') failedCount++;

      // By job
      const job = run.jobName || 'unknown';
      if (!byJob[job]) {
        byJob[job] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, count: 0, durationMs: 0 };
      }
      byJob[job].inputTokens += input;
      byJob[job].outputTokens += output;
      byJob[job].totalTokens += tokens;
      byJob[job].estimatedCost += cost;
      byJob[job].count++;
      byJob[job].durationMs += duration;

      // By role
      const role = run.agentRole || 'system';
      if (!byRole[role]) {
        byRole[role] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, count: 0, durationMs: 0 };
      }
      byRole[role].inputTokens += input;
      byRole[role].outputTokens += output;
      byRole[role].totalTokens += tokens;
      byRole[role].estimatedCost += cost;
      byRole[role].count++;
      byRole[role].durationMs += duration;
    }

    return {
      totals: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
        estimatedCost: totalCost, // in cents
        estimatedCostUsd: (totalCost / 100).toFixed(4),
        totalDurationMs: totalDuration,
        runCount: runs.length,
        successCount,
        failedCount
      },
      byJob: Object.entries(byJob).map(([name, data]) => ({
        name,
        ...data,
        estimatedCostUsd: (data.estimatedCost / 100).toFixed(4)
      })),
      byRole: Object.entries(byRole).map(([name, data]) => ({
        name,
        ...data,
        estimatedCostUsd: (data.estimatedCost / 100).toFixed(4)
      })),
      runs: runs.map(r => ({
        ...r,
        estimatedCostUsd: r.estimatedCost ? (r.estimatedCost / 100).toFixed(4) : '0.0000'
      }))
    };
  }

  async approve(workflowId: string, patchSetId?: string, approvedBy: string = 'me') {
    // Pick latest patch set if not provided
    const patchSet =
      patchSetId
        ? await this.prisma.patchSet.findUnique({ where: { id: patchSetId } })
        : await this.prisma.patchSet.findFirst({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
          });

    if (!patchSet) {
      return { ok: false, error: 'NO_PATCH_SET_FOUND' };
    }

    // Record approval
    await this.prisma.approval.create({
      data: { workflowId, kind: 'apply_patches' }
    });

    await this.prisma.patchSet.update({
      where: { id: patchSet.id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy }
    });

    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.approve',
        payload: { patchSetId: patchSet.id, approvedBy }
      }
    });

    // REFACTORED: Emit event to orchestrator instead of directly enqueueing apply_patches
    // The orchestrator will decide whether to enqueue apply_patches based on state + context
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_APPROVAL_RECORDED' }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }

  async requestChanges(workflowId: string, patchSetId?: string, comment: string = '', requestedBy: string = 'me') {
    // Pick latest patch set if not provided
    const patchSet =
      patchSetId
        ? await this.prisma.patchSet.findUnique({ where: { id: patchSetId } })
        : await this.prisma.patchSet.findFirst({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
          });

    if (!patchSet) {
      return { ok: false, error: 'NO_PATCH_SET_FOUND' };
    }

    // Store feedback in workflow for LLM to use on next iteration
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { feedback: comment }
    });

    // Record event for request changes
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.request_changes',
        payload: { patchSetId: patchSet.id, comment, requestedBy }
      }
    });

    // Emit event to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_CHANGES_REQUESTED', comment }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }

  async reject(workflowId: string, patchSetId?: string, reason: string = '', rejectedBy: string = 'me') {
    // Pick latest patch set if not provided
    const patchSet =
      patchSetId
        ? await this.prisma.patchSet.findUnique({ where: { id: patchSetId } })
        : await this.prisma.patchSet.findFirst({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
          });

    if (!patchSet) {
      return { ok: false, error: 'NO_PATCH_SET_FOUND' };
    }

    // Update patch set status to rejected
    await this.prisma.patchSet.update({
      where: { id: patchSet.id },
      data: { status: 'rejected' }
    });

    // Record event for rejection
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.reject',
        payload: { patchSetId: patchSet.id, reason, rejectedBy }
      }
    });

    // Emit event to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_PATCH_SET_REJECTED', reason }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }

  async cancel(workflowId: string, cancelledBy: string = 'user') {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      return { ok: false, error: 'WORKFLOW_NOT_FOUND' };
    }

    // Only allow cancelling workflows that are in-progress
    const cancellableStates = ['INGESTED', 'PATCHES_PROPOSED', 'WAITING_USER_APPROVAL', 'APPLYING_PATCHES', 'PR_OPEN', 'VERIFYING_CI'];
    if (!cancellableStates.includes(workflow.state)) {
      return { ok: false, error: 'WORKFLOW_NOT_CANCELLABLE', state: workflow.state };
    }

    // Update workflow state to CANCELLED
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { state: 'CANCELLED' }
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.cancel',
        payload: { cancelledBy, previousState: workflow.state }
      }
    });

    return { ok: true, workflowId };
  }

  async delete(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      return { ok: false, error: 'WORKFLOW_NOT_FOUND' };
    }

    // Delete in order to respect foreign key constraints
    await this.prisma.workflowEvent.deleteMany({ where: { workflowId } });
    await this.prisma.approval.deleteMany({ where: { workflowId } });
    await this.prisma.policyViolation.deleteMany({ where: { workflowId } });
    await this.prisma.workflowRun.deleteMany({ where: { workflowId } });
    await this.prisma.artifact.deleteMany({ where: { workflowId } });
    await this.prisma.pullRequest.deleteMany({ where: { workflowId } });

    // Delete patches first, then patch sets
    const patchSets = await this.prisma.patchSet.findMany({ where: { workflowId } });
    for (const ps of patchSets) {
      await this.prisma.patch.deleteMany({ where: { patchSetId: ps.id } });
    }
    await this.prisma.patchSet.deleteMany({ where: { workflowId } });

    await this.prisma.workflowRepo.deleteMany({ where: { workflowId } });
    await this.prisma.stageDecision.deleteMany({ where: { workflowId } });
    await this.prisma.workflow.delete({ where: { id: workflowId } });

    return { ok: true, workflowId };
  }

  // ============================================================================
  // Stage Actions (Gated Pipeline)
  // ============================================================================

  private readonly VALID_STAGES = ['feasibility', 'architecture', 'timeline', 'summary', 'patches', 'policy', 'sandbox', 'pr'];
  private readonly NEXT_STAGE: Record<string, string> = {
    'feasibility': 'architecture',
    'architecture': 'timeline',
    'timeline': 'summary',
    'summary': 'patches',
    'patches': 'policy',
    'policy': 'sandbox',
    'sandbox': 'pr',
    'pr': 'done'
  };

  async approveStage(
    workflowId: string,
    stage: string,
    reason?: string,
    actorId?: string,
    actorName?: string
  ) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });

    if (!workflow) {
      return { ok: false, error: 'WORKFLOW_NOT_FOUND', workflowId, stage, newStatus: '' };
    }

    // Validate stage
    if (!this.VALID_STAGES.includes(stage)) {
      return { ok: false, error: 'INVALID_STAGE', workflowId, stage, newStatus: '' };
    }

    // Check workflow is at the right stage and status
    if (workflow.stage !== stage) {
      return { ok: false, error: 'WRONG_STAGE', workflowId, stage, newStatus: workflow.stageStatus, currentStage: workflow.stage };
    }

    if (workflow.stageStatus !== 'ready') {
      return { ok: false, error: 'STAGE_NOT_READY', workflowId, stage, newStatus: workflow.stageStatus };
    }

    // For policy stage, verify no blocking violations exist
    if (stage === 'policy') {
      const blockingViolation = await this.prisma.policyViolation.findFirst({
        where: { workflowId, severity: 'BLOCK' }
      });
      if (blockingViolation) {
        return { ok: false, error: 'BLOCKING_VIOLATIONS_EXIST', workflowId, stage, newStatus: workflow.stageStatus };
      }
    }

    // Create decision record
    const decision = await this.prisma.stageDecision.create({
      data: {
        workflowId,
        stage,
        decision: 'approve',
        reason: reason || null,
        actorId: actorId || null,
        actorName: actorName || null,
      }
    });

    // Determine next stage
    const nextStage = this.NEXT_STAGE[stage] || 'done';

    // Update workflow
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        stage: nextStage,
        stageStatus: nextStage === 'done' ? 'approved' : 'pending',
        stageUpdatedAt: new Date(),
        state: nextStage === 'done' ? 'DONE' : workflow.state, // Update legacy state if done
      }
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: `ui.stage.${stage}.approved`,
        payload: { stage, reason, actorId, actorName, nextStage, decisionId: decision.id }
      }
    });

    // Emit event to orchestrator to process next stage
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_STAGE_APPROVED', stage, nextStage }
    });

    return { ok: true, workflowId, stage, newStatus: 'approved', decisionId: decision.id };
  }

  async rejectStage(
    workflowId: string,
    stage: string,
    reason?: string,
    actorId?: string,
    actorName?: string
  ) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });

    if (!workflow) {
      return { ok: false, error: 'WORKFLOW_NOT_FOUND', workflowId, stage, newStatus: '' };
    }

    // Validate stage
    if (!this.VALID_STAGES.includes(stage)) {
      return { ok: false, error: 'INVALID_STAGE', workflowId, stage, newStatus: '' };
    }

    // Check workflow is at the right stage
    if (workflow.stage !== stage) {
      return { ok: false, error: 'WRONG_STAGE', workflowId, stage, newStatus: workflow.stageStatus, currentStage: workflow.stage };
    }

    // Create decision record
    const decision = await this.prisma.stageDecision.create({
      data: {
        workflowId,
        stage,
        decision: 'reject',
        reason: reason || null,
        actorId: actorId || null,
        actorName: actorName || null,
      }
    });

    // Update workflow - rejected stops the workflow
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        stageStatus: 'rejected',
        stageUpdatedAt: new Date(),
        state: 'REJECTED',
      }
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: `ui.stage.${stage}.rejected`,
        payload: { stage, reason, actorId, actorName, decisionId: decision.id }
      }
    });

    // Emit event to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_STAGE_REJECTED', stage, reason }
    });

    return { ok: true, workflowId, stage, newStatus: 'rejected', decisionId: decision.id };
  }

  async requestStageChanges(
    workflowId: string,
    stage: string,
    reason: string,
    actorId?: string,
    actorName?: string
  ) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });

    if (!workflow) {
      return { ok: false, error: 'WORKFLOW_NOT_FOUND', workflowId, stage, newStatus: '' };
    }

    // Validate stage
    if (!this.VALID_STAGES.includes(stage)) {
      return { ok: false, error: 'INVALID_STAGE', workflowId, stage, newStatus: '' };
    }

    // Check workflow is at the right stage
    if (workflow.stage !== stage) {
      return { ok: false, error: 'WRONG_STAGE', workflowId, stage, newStatus: workflow.stageStatus, currentStage: workflow.stage };
    }

    // Create decision record
    const decision = await this.prisma.stageDecision.create({
      data: {
        workflowId,
        stage,
        decision: 'request_changes',
        reason: reason || null,
        actorId: actorId || null,
        actorName: actorName || null,
      }
    });

    // Update workflow - needs_changes triggers re-run
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        stageStatus: 'needs_changes',
        stageUpdatedAt: new Date(),
        feedback: reason, // Store feedback for LLM
      }
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: `ui.stage.${stage}.request_changes`,
        payload: { stage, reason, actorId, actorName, decisionId: decision.id }
      }
    });

    // Emit event to orchestrator to re-run the stage
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_STAGE_CHANGES_REQUESTED', stage, reason }
    });

    return { ok: true, workflowId, stage, newStatus: 'needs_changes', decisionId: decision.id };
  }

  /**
   * Retry a stage from scratch (no feedback, just re-run).
   * Sets stageStatus to pending and enqueues the stage job.
   */
  async retryStage(
    workflowId: string,
    stage: string,
    actorId?: string,
    actorName?: string
  ) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });

    if (!workflow) {
      return { ok: false, error: 'WORKFLOW_NOT_FOUND', workflowId, stage, newStatus: '' };
    }

    // Validate stage
    if (!this.VALID_STAGES.includes(stage)) {
      return { ok: false, error: 'INVALID_STAGE', workflowId, stage, newStatus: '' };
    }

    // Check workflow is at the right stage (can only retry current stage)
    if (workflow.stage !== stage) {
      return { ok: false, error: 'WRONG_STAGE', workflowId, stage, newStatus: workflow.stageStatus, currentStage: workflow.stage };
    }

    // Can only retry if stage is complete or in a retryable state (not pending/processing)
    const retryableStatuses = ['ready', 'needs_changes', 'blocked', 'approved'];
    if (!retryableStatuses.includes(workflow.stageStatus || '')) {
      return { ok: false, error: 'STAGE_NOT_RETRYABLE', workflowId, stage, newStatus: workflow.stageStatus };
    }

    // Update workflow - reset stage to pending
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        stageStatus: 'pending',
        stageUpdatedAt: new Date(),
      }
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: `ui.stage.${stage}.retry`,
        payload: { stage, actorId, actorName }
      }
    });

    // Emit event to orchestrator to re-run the stage
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_STAGE_RETRY', stage }
    });

    return { ok: true, workflowId, stage, newStatus: 'pending' };
  }
}

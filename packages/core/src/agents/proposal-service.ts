/**
 * Proposal Service
 *
 * Handles agent proposals, converts them to PatchSets, and runs them through Gate2.
 * All agent output must go through this service for policy enforcement.
 */

import { PrismaClient } from '@prisma/client';
import {
  Agent,
  AgentContext,
  ProposalResult,
  PatchSetProposal,
  AgentPatchProposal,
} from './types';
import { AgentRegistry, AgentSelector } from './registry';
import { Gate2Service, Gate2Result, evaluateGate2 } from '../policy/gate2';
import type { PolicyConfig } from '../policy/policy-engine';

// ============================================================================
// Types
// ============================================================================

/**
 * Proposal submission result.
 */
export interface SubmissionResult {
  success: boolean;
  proposalId?: string;
  patchSetId?: string;
  gate2Result?: Gate2Result;
  error?: string;
  requiresApproval: boolean;
}

/**
 * Multi-agent proposal result.
 */
export interface MultiAgentResult {
  proposals: ProposalResult[];
  mergedPatchSet?: PatchSetProposal;
  gate2Result?: Gate2Result;
  requiresApproval: boolean;
  conflicts?: PatchConflict[];
}

/**
 * Patch conflict information.
 */
export interface PatchConflict {
  file: string;
  agents: string[];
  type: 'overlap' | 'modification' | 'deletion';
  resolution: 'first-wins' | 'last-wins' | 'manual' | 'merged';
}

/**
 * Coordination strategy for multi-agent proposals.
 */
export type CoordinationStrategy =
  | 'parallel'      // All agents run simultaneously
  | 'sequential'    // Agents run one after another
  | 'priority'      // Higher confidence agents go first
  | 'specialized';  // Each agent handles specific file types

/**
 * Proposal service configuration.
 */
export interface ProposalServiceConfig {
  prisma: PrismaClient;
  registry: AgentRegistry;
  policyConfig?: Partial<PolicyConfig>;
  coordinationStrategy?: CoordinationStrategy;
  conflictResolution?: 'first-wins' | 'last-wins' | 'highest-confidence';
}

// ============================================================================
// Proposal Service
// ============================================================================

export class ProposalService {
  private readonly prisma: PrismaClient;
  private readonly registry: AgentRegistry;
  private readonly selector: AgentSelector;
  private readonly gate2: Gate2Service;
  private readonly policyConfig?: Partial<PolicyConfig>;
  private readonly coordinationStrategy: CoordinationStrategy;
  private readonly conflictResolution: 'first-wins' | 'last-wins' | 'highest-confidence';

  constructor(config: ProposalServiceConfig) {
    this.prisma = config.prisma;
    this.registry = config.registry;
    this.selector = new AgentSelector(config.registry);
    this.gate2 = new Gate2Service(config.prisma);
    this.policyConfig = config.policyConfig;
    this.coordinationStrategy = config.coordinationStrategy || 'parallel';
    this.conflictResolution = config.conflictResolution || 'highest-confidence';
  }

  // --------------------------------------------------------------------------
  // Single Agent Proposals
  // --------------------------------------------------------------------------

  /**
   * Generate and submit a proposal from an agent.
   */
  async generateAndSubmit(
    agentId: string,
    context: AgentContext
  ): Promise<SubmissionResult> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        success: false,
        error: `Agent not found: ${agentId}`,
        requiresApproval: false,
      };
    }

    // Generate proposal
    const proposal = await agent.propose(context);
    if (!proposal.success || !proposal.patchSet) {
      return {
        success: false,
        error: proposal.error || 'Agent failed to generate proposal',
        requiresApproval: false,
      };
    }

    // Submit through Gate2
    return this.submitProposal(context.workflowId, proposal);
  }

  /**
   * Auto-select an agent and generate a proposal.
   */
  async autoGenerateAndSubmit(context: AgentContext): Promise<SubmissionResult> {
    const selection = await this.selector.select(context);
    if (!selection) {
      return {
        success: false,
        error: 'No suitable agent found for task',
        requiresApproval: false,
      };
    }

    return this.generateAndSubmit(selection.agent.id, context);
  }

  // --------------------------------------------------------------------------
  // Multi-Agent Proposals
  // --------------------------------------------------------------------------

  /**
   * Generate proposals from multiple agents in parallel.
   */
  async generateParallel(
    context: AgentContext,
    maxAgents = 3
  ): Promise<MultiAgentResult> {
    const selections = await this.selector.selectMultiple(context, maxAgents);

    if (selections.length === 0) {
      return {
        proposals: [],
        requiresApproval: false,
      };
    }

    // Generate proposals in parallel
    const proposalPromises = selections.map(s => s.agent.propose(context));
    const proposals = await Promise.all(proposalPromises);

    // Use shared finalization with conflict detection
    return this.finalizeMultiAgentResult(proposals, context);
  }

  /**
   * Submit merged proposals after parallel generation.
   */
  async submitMergedProposal(
    workflowId: string,
    result: MultiAgentResult
  ): Promise<SubmissionResult> {
    if (!result.mergedPatchSet) {
      return {
        success: false,
        error: 'No merged patch set to submit',
        requiresApproval: false,
      };
    }

    // Re-evaluate Gate2 if not done
    const gate2Result = result.gate2Result ||
      this.evaluateProposalGate2(result.mergedPatchSet);

    if (gate2Result.verdict === 'FAIL') {
      return {
        success: false,
        gate2Result,
        error: `Gate2 failed: ${gate2Result.summary}`,
        requiresApproval: false,
      };
    }

    // Persist PatchSet
    const patchSetId = await this.persistPatchSet(workflowId, result.mergedPatchSet);

    // Record event
    await this.recordProposalEvent(workflowId, patchSetId, result.proposals.length);

    return {
      success: true,
      patchSetId,
      gate2Result,
      requiresApproval: true,
    };
  }

  // --------------------------------------------------------------------------
  // Enhanced Coordination
  // --------------------------------------------------------------------------

  /**
   * Coordinate multiple agents with strategy-based execution.
   */
  async coordinate(
    context: AgentContext,
    strategy?: CoordinationStrategy,
    maxAgents = 3
  ): Promise<MultiAgentResult> {
    const effectiveStrategy = strategy || this.coordinationStrategy;

    switch (effectiveStrategy) {
      case 'sequential':
        return this.coordinateSequential(context, maxAgents);
      case 'priority':
        return this.coordinatePriority(context, maxAgents);
      case 'specialized':
        return this.coordinateSpecialized(context);
      case 'parallel':
      default:
        return this.generateParallel(context, maxAgents);
    }
  }

  /**
   * Sequential coordination - agents run one after another.
   */
  private async coordinateSequential(
    context: AgentContext,
    maxAgents: number
  ): Promise<MultiAgentResult> {
    const selections = await this.selector.selectMultiple(context, maxAgents);
    const proposals: ProposalResult[] = [];

    for (const selection of selections) {
      const proposal = await selection.agent.propose(context);
      proposals.push(proposal);

      // Update context with previous proposal info for subsequent agents
      if (proposal.success && proposal.patchSet) {
        context = {
          ...context,
          previousProposals: [...(context.previousProposals || []), proposal.patchSet],
        };
      }
    }

    return this.finalizeMultiAgentResult(proposals, context);
  }

  /**
   * Priority coordination - higher confidence agents go first.
   */
  private async coordinatePriority(
    context: AgentContext,
    maxAgents: number
  ): Promise<MultiAgentResult> {
    const selections = await this.selector.selectMultiple(context, maxAgents);

    // Sort by confidence (highest first)
    selections.sort((a, b) => b.validation.confidence - a.validation.confidence);

    const proposals: ProposalResult[] = [];
    const handledFiles = new Set<string>();

    for (const selection of selections) {
      // Filter target files to only those not yet handled
      const remainingFiles = context.task.targetFiles.filter(f => !handledFiles.has(f));

      if (remainingFiles.length === 0) break;

      const filteredContext: AgentContext = {
        ...context,
        task: {
          ...context.task,
          targetFiles: remainingFiles,
        },
      };

      const proposal = await selection.agent.propose(filteredContext);
      proposals.push(proposal);

      // Mark files as handled
      if (proposal.success && proposal.patchSet) {
        for (const patch of proposal.patchSet.patches) {
          for (const file of patch.files) {
            handledFiles.add(file.path);
          }
        }
      }
    }

    return this.finalizeMultiAgentResult(proposals, context);
  }

  /**
   * Specialized coordination - each agent handles specific file types.
   */
  private async coordinateSpecialized(context: AgentContext): Promise<MultiAgentResult> {
    // Group files by type
    const fileGroups = this.groupFilesByType(context.task.targetFiles);
    const proposals: ProposalResult[] = [];

    for (const [agentType, files] of Object.entries(fileGroups)) {
      if (files.length === 0) continue;

      const agent = this.registry.getByType(agentType as any);
      if (!agent) continue;

      const specializedContext: AgentContext = {
        ...context,
        task: {
          ...context.task,
          targetFiles: files,
        },
      };

      const proposal = await agent.propose(specializedContext);
      proposals.push(proposal);
    }

    return this.finalizeMultiAgentResult(proposals, context);
  }

  /**
   * Finalize multi-agent result with conflict detection.
   */
  private async finalizeMultiAgentResult(
    proposals: ProposalResult[],
    context: AgentContext
  ): Promise<MultiAgentResult> {
    const successfulProposals = proposals.filter(p => p.success && p.patchSet);

    if (successfulProposals.length === 0) {
      return { proposals, requiresApproval: false };
    }

    // Detect conflicts
    const conflicts = this.detectConflicts(successfulProposals);

    // Merge with conflict resolution
    const mergedPatchSet = this.mergePatchSetsWithResolution(
      successfulProposals.map(p => p.patchSet!),
      context.repo.baseSha,
      conflicts
    );

    const gate2Result = this.evaluateProposalGate2(mergedPatchSet);

    return {
      proposals,
      mergedPatchSet,
      gate2Result,
      requiresApproval: true,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  }

  /**
   * Detect conflicts between proposals.
   */
  private detectConflicts(proposals: ProposalResult[]): PatchConflict[] {
    const conflicts: PatchConflict[] = [];
    const fileAgentMap = new Map<string, { agents: string[]; actions: string[] }>();

    for (const proposal of proposals) {
      if (!proposal.patchSet) continue;

      for (const patch of proposal.patchSet.patches) {
        for (const file of patch.files) {
          const existing = fileAgentMap.get(file.path);
          if (existing) {
            existing.agents.push(proposal.metadata.agentId);
            existing.actions.push(file.action);
          } else {
            fileAgentMap.set(file.path, {
              agents: [proposal.metadata.agentId],
              actions: [file.action],
            });
          }
        }
      }
    }

    // Find files touched by multiple agents
    for (const [file, info] of fileAgentMap.entries()) {
      if (info.agents.length > 1) {
        const hasDelete = info.actions.includes('delete');
        const hasModify = info.actions.includes('modify');

        conflicts.push({
          file,
          agents: info.agents,
          type: hasDelete ? 'deletion' : hasModify ? 'modification' : 'overlap',
          resolution: this.conflictResolution === 'highest-confidence' ? 'first-wins' : this.conflictResolution,
        });
      }
    }

    return conflicts;
  }

  /**
   * Group files by their likely agent type.
   */
  private groupFilesByType(files: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {
      frontend: [],
      backend: [],
      test: [],
      docs: [],
      other: [],
    };

    for (const file of files) {
      if (this.isFrontendFile(file)) {
        groups.frontend.push(file);
      } else if (this.isTestFile(file)) {
        groups.test.push(file);
      } else if (this.isDocsFile(file)) {
        groups.docs.push(file);
      } else if (this.isBackendFile(file)) {
        groups.backend.push(file);
      } else {
        groups.other.push(file);
      }
    }

    return groups;
  }

  private isFrontendFile(file: string): boolean {
    return /\.(tsx|jsx|css|scss|vue|svelte)$/.test(file) ||
      file.includes('components/') ||
      file.includes('pages/') ||
      file.includes('views/');
  }

  private isTestFile(file: string): boolean {
    return file.includes('.spec.') ||
      file.includes('.test.') ||
      file.includes('__tests__') ||
      file.includes('/test/') ||
      file.includes('/tests/');
  }

  private isDocsFile(file: string): boolean {
    return /\.(md|mdx|rst|txt)$/.test(file) ||
      file.includes('docs/');
  }

  private isBackendFile(file: string): boolean {
    return /\.(ts|js|py|go|java|rs)$/.test(file) &&
      !this.isFrontendFile(file) &&
      !this.isTestFile(file);
  }

  /**
   * Merge patch sets with conflict resolution.
   */
  private mergePatchSetsWithResolution(
    patchSets: PatchSetProposal[],
    baseSha: string,
    conflicts: PatchConflict[]
  ): PatchSetProposal {
    const conflictFiles = new Set(conflicts.map(c => c.file));
    const allPatches: AgentPatchProposal[] = [];
    const titles: string[] = [];
    const handledTasks = new Set<string>();

    for (const ps of patchSets) {
      titles.push(ps.title);

      for (const patch of ps.patches) {
        // Skip if task already handled
        if (handledTasks.has(patch.taskId)) continue;

        // For conflicting files, apply resolution strategy
        const patchFiles = patch.files.filter(f => {
          if (conflictFiles.has(f.path)) {
            // First-wins: only include if this is the first patch with this file
            return !allPatches.some(p =>
              p.files.some(pf => pf.path === f.path)
            );
          }
          return true;
        });

        if (patchFiles.length > 0) {
          allPatches.push({
            ...patch,
            files: patchFiles,
          });
          handledTasks.add(patch.taskId);
        }
      }
    }

    return {
      title: `Merged: ${titles.join(' + ')}`,
      description: `Combined proposals from ${patchSets.length} agents${conflicts.length > 0 ? ` (${conflicts.length} conflicts resolved)` : ''}`,
      baseSha,
      patches: allPatches,
    };
  }

  // --------------------------------------------------------------------------
  // Submission & Gate2 Integration
  // --------------------------------------------------------------------------

  /**
   * Submit a single proposal through Gate2.
   */
  private async submitProposal(
    workflowId: string,
    proposal: ProposalResult
  ): Promise<SubmissionResult> {
    if (!proposal.patchSet) {
      return {
        success: false,
        error: 'No patch set in proposal',
        requiresApproval: false,
      };
    }

    // Evaluate with Gate2
    const gate2Result = this.evaluateProposalGate2(proposal.patchSet);

    // If Gate2 fails, reject the proposal
    if (gate2Result.verdict === 'FAIL') {
      // Still persist for audit, but mark as rejected
      await this.recordRejectedProposal(workflowId, proposal, gate2Result);

      return {
        success: false,
        gate2Result,
        error: `Gate2 failed: ${gate2Result.summary}`,
        requiresApproval: false,
      };
    }

    // Persist PatchSet
    const patchSetId = await this.persistPatchSet(workflowId, proposal.patchSet);

    // Persist violations if any warnings
    if (gate2Result.warningCount > 0) {
      await this.gate2.evaluateAndPersist({
        workflowId,
        patchSetId,
        diff: this.combineDiffs(proposal.patchSet.patches),
        config: this.policyConfig as any,
      });
    }

    // Record event
    await this.recordProposalEvent(workflowId, patchSetId, 1);

    return {
      success: true,
      patchSetId,
      gate2Result,
      requiresApproval: true, // All proposals require approval
    };
  }

  /**
   * Evaluate a PatchSet through Gate2.
   */
  private evaluateProposalGate2(patchSet: PatchSetProposal): Gate2Result {
    const combinedDiff = this.combineDiffs(patchSet.patches);
    return evaluateGate2(combinedDiff, this.policyConfig as any);
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  /**
   * Persist a PatchSet to the database.
   */
  private async persistPatchSet(
    workflowId: string,
    patchSet: PatchSetProposal
  ): Promise<string> {
    const result = await this.prisma.patchSet.create({
      data: {
        workflowId,
        title: patchSet.title,
        baseSha: patchSet.baseSha,
        status: 'proposed',
        patches: {
          create: patchSet.patches.map(patch => ({
            taskId: patch.taskId,
            title: patch.title,
            summary: patch.summary,
            diff: patch.diff,
            files: JSON.parse(JSON.stringify(patch.files)),
            addsTests: patch.addsTests,
            riskLevel: patch.riskLevel,
            proposedCommands: JSON.parse(JSON.stringify(patch.commands || [])),
          })),
        },
      },
    });

    return result.id;
  }

  /**
   * Record a proposal event.
   */
  private async recordProposalEvent(
    workflowId: string,
    patchSetId: string,
    agentCount: number
  ): Promise<void> {
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'PROPOSAL_GENERATED',
        payload: JSON.parse(JSON.stringify({
          patchSetId,
          agentCount,
          timestamp: new Date().toISOString(),
        })),
      },
    });
  }

  /**
   * Record a rejected proposal for audit.
   */
  private async recordRejectedProposal(
    workflowId: string,
    proposal: ProposalResult,
    gate2Result: Gate2Result
  ): Promise<void> {
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'PROPOSAL_REJECTED',
        payload: JSON.parse(JSON.stringify({
          agentId: proposal.metadata.agentId,
          agentType: proposal.metadata.agentType,
          gate2Verdict: gate2Result.verdict,
          violations: gate2Result.violations,
          timestamp: new Date().toISOString(),
        })),
      },
    });
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Merge multiple PatchSets into one.
   */
  private mergePatchSets(
    patchSets: PatchSetProposal[],
    baseSha: string
  ): PatchSetProposal {
    const allPatches: AgentPatchProposal[] = [];
    const titles: string[] = [];

    for (const ps of patchSets) {
      titles.push(ps.title);
      allPatches.push(...ps.patches);
    }

    // Deduplicate patches by taskId (take first)
    const uniquePatches = new Map<string, AgentPatchProposal>();
    for (const patch of allPatches) {
      if (!uniquePatches.has(patch.taskId)) {
        uniquePatches.set(patch.taskId, patch);
      }
    }

    return {
      title: `Merged proposal: ${titles.join(', ')}`,
      description: `Combined proposals from ${patchSets.length} agents`,
      baseSha,
      patches: Array.from(uniquePatches.values()),
    };
  }

  /**
   * Combine diffs from multiple patches.
   */
  private combineDiffs(patches: AgentPatchProposal[]): string {
    return patches.map(p => p.diff).join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a proposal service instance.
 */
export function createProposalService(
  prisma: PrismaClient,
  registry: AgentRegistry,
  policyConfig?: Partial<PolicyConfig>
): ProposalService {
  return new ProposalService({
    prisma,
    registry,
    policyConfig,
  });
}

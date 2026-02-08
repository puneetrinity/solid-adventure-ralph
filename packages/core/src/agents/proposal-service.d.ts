/**
 * Proposal Service
 *
 * Handles agent proposals, converts them to PatchSets, and runs them through Gate2.
 * All agent output must go through this service for policy enforcement.
 */
import { PrismaClient } from '@prisma/client';
import { AgentContext, ProposalResult, PatchSetProposal } from './types';
import { AgentRegistry } from './registry';
import { Gate2Result } from '../policy/gate2';
import type { PolicyConfig } from '../policy/policy-engine';
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
export type CoordinationStrategy = 'parallel' | 'sequential' | 'priority' | 'specialized';
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
export declare class ProposalService {
    private readonly prisma;
    private readonly registry;
    private readonly selector;
    private readonly gate2;
    private readonly policyConfig?;
    private readonly coordinationStrategy;
    private readonly conflictResolution;
    constructor(config: ProposalServiceConfig);
    /**
     * Generate and submit a proposal from an agent.
     */
    generateAndSubmit(agentId: string, context: AgentContext): Promise<SubmissionResult>;
    /**
     * Auto-select an agent and generate a proposal.
     */
    autoGenerateAndSubmit(context: AgentContext): Promise<SubmissionResult>;
    /**
     * Generate proposals from multiple agents in parallel.
     */
    generateParallel(context: AgentContext, maxAgents?: number): Promise<MultiAgentResult>;
    /**
     * Submit merged proposals after parallel generation.
     */
    submitMergedProposal(workflowId: string, result: MultiAgentResult): Promise<SubmissionResult>;
    /**
     * Coordinate multiple agents with strategy-based execution.
     */
    coordinate(context: AgentContext, strategy?: CoordinationStrategy, maxAgents?: number): Promise<MultiAgentResult>;
    /**
     * Sequential coordination - agents run one after another.
     */
    private coordinateSequential;
    /**
     * Priority coordination - higher confidence agents go first.
     */
    private coordinatePriority;
    /**
     * Specialized coordination - each agent handles specific file types.
     */
    private coordinateSpecialized;
    /**
     * Finalize multi-agent result with conflict detection.
     */
    private finalizeMultiAgentResult;
    /**
     * Detect conflicts between proposals.
     */
    private detectConflicts;
    /**
     * Group files by their likely agent type.
     */
    private groupFilesByType;
    private isFrontendFile;
    private isTestFile;
    private isDocsFile;
    private isBackendFile;
    /**
     * Merge patch sets with conflict resolution.
     */
    private mergePatchSetsWithResolution;
    /**
     * Submit a single proposal through Gate2.
     */
    private submitProposal;
    /**
     * Evaluate a PatchSet through Gate2.
     */
    private evaluateProposalGate2;
    /**
     * Persist a PatchSet to the database.
     */
    private persistPatchSet;
    /**
     * Record a proposal event.
     */
    private recordProposalEvent;
    /**
     * Record a rejected proposal for audit.
     */
    private recordRejectedProposal;
    /**
     * Merge multiple PatchSets into one.
     */
    private mergePatchSets;
    /**
     * Combine diffs from multiple patches.
     */
    private combineDiffs;
}
/**
 * Create a proposal service instance.
 */
export declare function createProposalService(prisma: PrismaClient, registry: AgentRegistry, policyConfig?: Partial<PolicyConfig>): ProposalService;

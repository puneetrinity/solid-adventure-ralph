// Workflow types
export type WorkflowState =
  | 'INGESTED'
  | 'PATCHES_PROPOSED'
  | 'WAITING_USER_APPROVAL'
  | 'APPLYING_PATCHES'
  | 'PR_OPEN'
  | 'VERIFYING_CI'
  | 'DONE'
  | 'BLOCKED_POLICY'
  | 'NEEDS_HUMAN'
  | 'FAILED'
  | 'CANCELLED';

export interface PullRequest {
  id: string;
  workflowId: string;
  number: number;
  url: string;
  branch: string;
  status: 'open' | 'merged' | 'closed';
  repoOwner?: string;
  repoName?: string;
  createdAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  jobName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  errorMsg?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  agentRole?: string;
}

export interface Approval {
  id: string;
  workflowId: string;
  kind: string;
  createdAt: string;
}

export interface WorkflowRepo {
  id: string;
  workflowId: string;
  owner: string;
  repo: string;
  baseBranch: string;
  baseSha?: string;
  role: 'primary' | 'secondary';
  createdAt: string;
}

export interface Workflow {
  id: string;
  state: WorkflowState;
  title?: string;
  goal?: string;
  context?: string;
  feedback?: string;
  // Multi-repo support
  repos?: WorkflowRepo[];
  // Legacy single-repo fields (deprecated)
  repoOwner?: string;
  repoName?: string;
  baseBranch: string;
  baseSha?: string;
  createdAt: string;
  updatedAt: string;
  prUrl?: string;
  patchSets?: PatchSet[];
  artifacts?: Artifact[];
  events?: WorkflowEvent[];
  pullRequests?: PullRequest[];
  approvals?: Approval[];
  runs?: WorkflowRun[];
  policyViolations?: PolicyViolation[];
}

export interface PatchSet {
  id: string;
  workflowId: string;
  status: 'proposed' | 'approved' | 'rejected' | 'applied';
  baseSha: string;
  title?: string;
  repoOwner?: string;
  repoName?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  patches?: Patch[];
}

export interface Patch {
  id: string;
  patchSetId: string;
  filePath?: string;
  diff: string;
  title?: string;
  summary?: string;
  taskId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  addsTests?: boolean;
  proposedCommands?: string[];
  files?: Array<{ path: string; additions: number; deletions: number }>;
  repoOwner?: string;
  repoName?: string;
  createdAt: string;
}

export interface Artifact {
  id: string;
  workflowId: string;
  kind: string;
  content: string;
  createdAt: string;
}

export interface WorkflowEvent {
  id: string;
  workflowId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PolicyViolation {
  id: string;
  workflowId: string;
  patchSetId: string;
  rule: string;
  severity: 'WARN' | 'BLOCK';
  file: string;
  message: string;
  line?: number;
  evidence?: string;
  createdAt: string;
}

export interface ApiError {
  errorCode: string;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  owner: string;
  defaultBranch: string;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

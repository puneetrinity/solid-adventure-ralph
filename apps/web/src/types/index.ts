// Workflow types
export type WorkflowState =
  | 'INGESTED'
  | 'CONTEXT_GATHERED'
  | 'PLANNING'
  | 'PATCHES_PROPOSED'
  | 'WAITING_USER_APPROVAL'
  | 'APPLYING_PATCHES'
  | 'PR_OPEN'
  | 'DONE'
  | 'BLOCKED_POLICY'
  | 'NEEDS_HUMAN'
  | 'FAILED';

export interface PullRequest {
  id: string;
  workflowId: string;
  prNumber: number;
  url: string;
  state: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  state: WorkflowState;
  title?: string;
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
  approvals?: { id: string; kind: string; createdAt: string }[];
  policyViolations?: PolicyViolation[];
}

export interface PatchSet {
  id: string;
  workflowId: string;
  version: number;
  status: 'proposed' | 'approved' | 'rejected' | 'applied';
  baseSha: string;
  createdAt: string;
  patches?: Patch[];
}

export interface Patch {
  id: string;
  patchSetId: string;
  filePath: string;
  diff: string;
  title?: string;
  taskId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  addsTests?: boolean;
  proposedCommands?: string[];
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

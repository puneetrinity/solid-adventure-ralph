import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  AlertCircle,
  Clock,
  FileText,
  GitBranch,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  GitPullRequest,
  User,
  Timer,
  FolderTree,
  Layers,
  FileCode,
  Package,
  Trash2,
  Ban,
  Lightbulb,
  Boxes,
  CalendarClock,
  FileDiff,
  Shield,
  Rocket,
  History,
  Play,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Edit3,
} from 'lucide-react';
import { useWorkflow } from '../hooks/use-workflow';
import { WorkflowStatusBadge, CostSummary } from '../components/workflow';
import { Modal } from '../components/ui';
import { api } from '../api/client';
import type {
  Workflow,
  Artifact,
  PatchSet,
  Patch,
  PolicyViolation,
  PullRequest,
  WorkflowRun,
  WorkflowRepo,
  WorkflowEvent,
  GatedStage,
  StageStatus,
  StageDecision,
} from '../types';

type RepoContextStatus = {
  status: 'fresh' | 'stale' | 'missing' | 'error';
  context: {
    id: string;
    repoOwner: string;
    repoName: string;
    baseBranch: string;
    baseSha: string | null;
    contextPath: string;
    summary: string | null;
    isStale: boolean;
    updatedAt: string;
  } | null;
  error?: string;
};

const repoKey = (repo: WorkflowRepo) => `${repo.owner}/${repo.repo}@${repo.baseBranch}`;

export function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workflow, isLoading, error, refetch, isPolling, lastUpdated } = useWorkflow(id!);
  const [activeTab, setActiveTab] = useState<'overview' | 'feasibility' | 'architecture' | 'timeline' | 'summary' | 'artifacts' | 'policy' | 'sandbox' | 'patches' | 'runs' | 'activity'>('overview');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [repoContexts, setRepoContexts] = useState<Record<string, RepoContextStatus>>({});
  const [repoContextLoading, setRepoContextLoading] = useState(false);
  const [refreshingRepoKey, setRefreshingRepoKey] = useState<string | null>(null);

  // Stage action state
  const [stageActionLoading, setStageActionLoading] = useState(false);
  const [showStageRejectModal, setShowStageRejectModal] = useState(false);
  const [showStageChangesModal, setShowStageChangesModal] = useState(false);
  const [stageRejectReason, setStageRejectReason] = useState('');
  const [stageChangesReason, setStageChangesReason] = useState('');
  const [showSandboxRegenerateModal, setShowSandboxRegenerateModal] = useState(false);
  const [sandboxRegenerateReason, setSandboxRegenerateReason] = useState('');

  const canCancel = workflow && ['INGESTED', 'PATCHES_PROPOSED', 'WAITING_USER_APPROVAL', 'APPLYING_PATCHES', 'PR_OPEN', 'VERIFYING_CI'].includes(workflow.state);

  const repoKeySignature = (workflow?.repos || []).map(repoKey).join('|');

  const loadRepoContexts = useCallback(async () => {
    const repos = workflow?.repos || [];
    if (repos.length === 0) {
      setRepoContexts({});
      return;
    }

    setRepoContextLoading(true);
    try {
      const entries = await Promise.all(
        repos.map(async (repo) => {
          const key = repoKey(repo);
          try {
            const result = await api.repos.getContext(repo.owner, repo.repo, repo.baseBranch);
            return [key, result] as const;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load context';
            return [key, { status: 'error', context: null, error: message } as RepoContextStatus] as const;
          }
        })
      );
      const nextContexts = Object.fromEntries(entries) as Record<string, RepoContextStatus>;
      setRepoContexts(nextContexts);
    } finally {
      setRepoContextLoading(false);
    }
  }, [workflow?.repos, repoKeySignature]);

  useEffect(() => {
    if (!workflow?.repos || workflow.repos.length === 0) return;
    loadRepoContexts();
  }, [repoKeySignature, loadRepoContexts]);

  const handleCancel = async () => {
    if (!workflow) return;
    setActionLoading(true);
    try {
      await api.workflows.cancel(workflow.id);
      setShowCancelModal(false);
      await refetch();
    } catch (err) {
      console.error('Failed to cancel workflow:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;
    setActionLoading(true);
    try {
      await api.workflows.delete(workflow.id);
      setShowDeleteModal(false);
      navigate('/workflows');
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshContext = async (repo: WorkflowRepo) => {
    if (!workflow) return;
    const key = repoKey(repo);
    setRefreshingRepoKey(key);
    try {
      await api.repos.refreshContext(repo.owner, repo.repo, repo.baseBranch, workflow.id);
      await loadRepoContexts();
    } catch (err) {
      console.error('Failed to refresh context:', err);
    } finally {
      setRefreshingRepoKey(null);
    }
  };

  // Stage action handlers
  const handleStageApprove = async () => {
    if (!workflow || !workflow.stage) return;
    setStageActionLoading(true);
    try {
      await api.workflows.approveStage(workflow.id, workflow.stage);
      await refetch();
    } catch (err) {
      console.error('Failed to approve stage:', err);
    } finally {
      setStageActionLoading(false);
    }
  };

  const handleStageReject = async () => {
    if (!workflow || !workflow.stage || !stageRejectReason.trim()) return;
    setStageActionLoading(true);
    try {
      await api.workflows.rejectStage(workflow.id, workflow.stage, stageRejectReason);
      setShowStageRejectModal(false);
      setStageRejectReason('');
      await refetch();
    } catch (err) {
      console.error('Failed to reject stage:', err);
    } finally {
      setStageActionLoading(false);
    }
  };

  const handleStageRequestChanges = async () => {
    if (!workflow || !workflow.stage || !stageChangesReason.trim()) return;
    setStageActionLoading(true);
    try {
      await api.workflows.requestStageChanges(workflow.id, workflow.stage, stageChangesReason);
      setShowStageChangesModal(false);
      setStageChangesReason('');
      await refetch();
    } catch (err) {
      console.error('Failed to request changes:', err);
    } finally {
      setStageActionLoading(false);
    }
  };

  const handleStageRetry = async () => {
    if (!workflow || !workflow.stage) return;
    setStageActionLoading(true);
    try {
      await api.workflows.retryStage(workflow.id, workflow.stage);
      await refetch();
    } catch (err) {
      console.error('Failed to retry stage:', err);
    } finally {
      setStageActionLoading(false);
    }
  };

  const handleSandboxRegenerate = async () => {
    if (!workflow) return;
    setStageActionLoading(true);
    try {
      await api.workflows.regeneratePatches(
        workflow.id,
        sandboxRegenerateReason.trim() || undefined
      );
      setShowSandboxRegenerateModal(false);
      setSandboxRegenerateReason('');
      await refetch();
    } catch (err) {
      console.error('Failed to regenerate patches:', err);
    } finally {
      setStageActionLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const shortenSha = (sha: string | null | undefined) => {
    if (!sha) return '-';
    return sha.substring(0, 7);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Failed to load workflow</h3>
            <p className="text-sm text-red-700 mt-1">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-red-600 underline mt-2"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800">Workflow not found</p>
        <Link to="/workflows" className="text-sm text-yellow-600 underline mt-2 inline-block">
          Back to workflows
        </Link>
      </div>
    );
  }

  const latestPR = workflow.pullRequests?.[0];
  const sandboxArtifact = workflow.artifacts?.find(a => a.kind === 'SandboxResultV1');
  let sandboxFailed = false;
  if (sandboxArtifact) {
    try {
      const data = JSON.parse(sandboxArtifact.content);
      const status = data.status || data.conclusion;
      sandboxFailed = status === 'fail' || status === 'failure';
    } catch {
      sandboxFailed = false;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/workflows"
            className="p-2 rounded-md hover:bg-gray-100"
            aria-label="Back to workflows"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Workflow</h1>
              <WorkflowStatusBadge state={workflow.state} />
            </div>
            <p className="text-sm text-gray-500 font-mono mt-1">{workflow.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Polling indicator and last updated */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {isPolling && (
              <span className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs">Live</span>
              </span>
            )}
            {lastUpdated && (
              <span className="text-xs">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {workflow.stage && ['ready', 'needs_changes', 'blocked'].includes(workflow.stageStatus || '') && (
            <button
              onClick={handleStageRetry}
              disabled={stageActionLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-orange-300 text-orange-700 rounded-md hover:bg-orange-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${stageActionLoading ? 'animate-spin' : ''}`} />
              Retry Stage
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-yellow-300 text-yellow-700 rounded-md hover:bg-yellow-50"
            >
              <Ban className="h-4 w-4" />
              Cancel
            </button>
          )}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Workflow"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel this workflow? This will stop all in-progress operations.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCancelModal(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Keep Running
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Cancel Workflow
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Workflow"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to permanently delete this workflow? This action cannot be undone.
          </p>
          <p className="text-sm text-red-600 font-medium">
            All events, artifacts, patches, and related data will be deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Keep Workflow
            </button>
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>

      {/* Stage Reject Modal */}
      <Modal
        isOpen={showStageRejectModal}
        onClose={() => { setShowStageRejectModal(false); setStageRejectReason(''); }}
        title={`Reject ${workflow.stage} Stage`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will stop the workflow. Please provide a reason for rejection.
          </p>
          <textarea
            value={stageRejectReason}
            onChange={(e) => setStageRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowStageRejectModal(false); setStageRejectReason(''); }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStageReject}
              disabled={!stageRejectReason.trim() || stageActionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {stageActionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject
            </button>
          </div>
        </div>
      </Modal>

      {/* Stage Request Changes Modal */}
      <Modal
        isOpen={showStageChangesModal}
        onClose={() => { setShowStageChangesModal(false); setStageChangesReason(''); }}
        title={`Request Changes for ${workflow.stage} Stage`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Describe the changes needed. The stage will be re-run with your feedback.
          </p>
          <textarea
            value={stageChangesReason}
            onChange={(e) => setStageChangesReason(e.target.value)}
            placeholder="Describe the changes needed..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowStageChangesModal(false); setStageChangesReason(''); }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStageRequestChanges}
              disabled={!stageChangesReason.trim() || stageActionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              {stageActionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              Request Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Sandbox Regenerate Patches Modal */}
      <Modal
        isOpen={showSandboxRegenerateModal}
        onClose={() => { setShowSandboxRegenerateModal(false); setSandboxRegenerateReason(''); }}
        title="Regenerate Patches from CI Feedback"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will move the workflow back to the patches stage and re-run patch generation using the sandbox CI failure context.
          </p>
          <textarea
            value={sandboxRegenerateReason}
            onChange={(e) => setSandboxRegenerateReason(e.target.value)}
            placeholder="Optional: add a note for the LLM (e.g., focus on fixing test failures)..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowSandboxRegenerateModal(false); setSandboxRegenerateReason(''); }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSandboxRegenerate}
              disabled={stageActionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {stageActionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Regenerate Patches
            </button>
          </div>
        </div>
      </Modal>

      {/* Stage Pipeline Progress */}
      {workflow.stage && (
        <StagePipeline
          stage={workflow.stage}
          stageStatus={workflow.stageStatus || 'pending'}
          stageUpdatedAt={workflow.stageUpdatedAt}
          hasBlockingViolations={workflow.policyViolations?.some(v => v.severity === 'BLOCK') ?? false}
          sandboxFailed={sandboxFailed}
          onJumpToSandbox={() => setActiveTab('sandbox')}
          onStageSelect={(selectedStage) => {
            const stageToTab: Record<string, typeof activeTab> = {
              feasibility: 'feasibility',
              architecture: 'architecture',
              timeline: 'timeline',
              summary: 'summary',
              patches: 'patches',
              policy: 'policy',
              sandbox: 'sandbox',
              pr: 'overview',
            };
            const nextTab = stageToTab[selectedStage] || 'overview';
            setActiveTab(nextTab);
          }}
          onApprove={handleStageApprove}
          onReject={() => setShowStageRejectModal(true)}
          onRequestChanges={() => setShowStageChangesModal(true)}
          onRetry={handleStageRetry}
          isLoading={stageActionLoading}
        />
      )}

      {/* Approval banner when waiting */}
      {workflow.state === 'WAITING_USER_APPROVAL' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Awaiting Your Approval</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Go to the <button onClick={() => setActiveTab('patches')} className="underline font-medium">Patches tab</button> to review and approve/reject each patch set.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feasibility Summary Card */}
      {(() => {
        const feasibilityArtifact = workflow.artifacts?.find(a => a.kind === 'FeasibilityV1');
        if (!feasibilityArtifact) return null;
        try {
          const data = JSON.parse(feasibilityArtifact.content);
          const bgColor = data.recommendation === 'proceed' ? 'bg-green-50 border-green-200' :
                          data.recommendation === 'hold' ? 'bg-yellow-50 border-yellow-200' :
                          'bg-red-50 border-red-200';
          const textColor = data.recommendation === 'proceed' ? 'text-green-700' :
                            data.recommendation === 'hold' ? 'text-yellow-700' : 'text-red-700';
          return (
            <div className={`rounded-lg border p-3 ${bgColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lightbulb className={`h-5 w-5 ${textColor}`} />
                  <div>
                    <span className={`font-semibold capitalize ${textColor}`}>
                      Feasibility: {data.recommendation}
                    </span>
                    <span className="text-gray-600 ml-3 text-sm">
                      {data.risks?.length || 0} risks · {data.unknowns?.length || 0} unknowns · {data.alternatives?.length || 0} alternatives
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('feasibility')}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Details →
                </button>
              </div>
            </div>
          );
        } catch { return null; }
      })()}

      {/* Goal & Context */}
      {(workflow.featureGoal || workflow.businessJustification || workflow.goal || workflow.context) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          {(workflow.featureGoal || workflow.goal) && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Feature Goal</p>
              <p className="text-sm text-gray-900">{workflow.featureGoal || workflow.goal}</p>
            </div>
          )}
          {workflow.businessJustification && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Business Justification</p>
              <p className="text-sm text-gray-700">{workflow.businessJustification}</p>
            </div>
          )}
          {workflow.context && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Additional Context</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{workflow.context}</p>
            </div>
          )}
          {workflow.feedback && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-yellow-600 uppercase mb-1">Latest Feedback</p>
              <p className="text-sm text-yellow-800 bg-yellow-50 p-2 rounded">{workflow.feedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Repositories */}
      {workflow.repos && workflow.repos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase mb-2">Repositories ({workflow.repos.length})</p>
          <div className="flex flex-wrap gap-2">
            {workflow.repos.map((repo) => (
              <div
                key={repo.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  repo.role === 'primary' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="font-mono">{repo.owner}/{repo.repo}</span>
                <span className="text-xs opacity-75">({repo.baseBranch})</span>
                {repo.role === 'primary' && (
                  <span className="text-xs bg-blue-200 px-1.5 py-0.5 rounded">primary</span>
                )}
              </div>
            ))}
          </div>

          {/* Context status */}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 uppercase">Context Status</p>
              {repoContextLoading && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Loading
                </span>
              )}
            </div>
            <div className="space-y-2">
              {workflow.repos.map((repo) => {
                const key = repoKey(repo);
                const status = repoContexts[key]?.status ?? 'missing';
                const context = repoContexts[key]?.context ?? null;
                const statusLabel =
                  status === 'fresh' ? 'Fresh' :
                  status === 'stale' ? 'Stale' :
                  status === 'error' ? 'Error' :
                  'Missing';
                const statusClass =
                  status === 'fresh' ? 'bg-green-50 text-green-700 border-green-200' :
                  status === 'stale' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                  status === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-gray-50 text-gray-600 border-gray-200';

                return (
                  <div key={key} className="flex items-center justify-between gap-3 p-2 bg-gray-50 rounded">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-700">
                          {repo.owner}/{repo.repo}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded border ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {context?.contextPath ? `Context: ${context.contextPath}` : 'Context file not found'}
                        {context?.updatedAt && (
                          <span className="ml-2">• Updated {new Date(context.updatedAt).toLocaleString()}</span>
                        )}
                      </div>
                      {repoContexts[key]?.error && (
                        <div className="text-xs text-red-600 mt-1">{repoContexts[key]?.error}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRefreshContext(repo)}
                      disabled={refreshingRepoKey === key}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshingRepoKey === key ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase">Created</p>
            <p className="text-sm font-medium">{formatDate(workflow.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Base SHA</p>
            <p className="text-sm font-mono">{shortenSha(workflow.baseSha)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">State</p>
            <p className="text-sm font-medium">{workflow.state}</p>
          </div>
          {latestPR && (
            <div>
              <p className="text-xs text-gray-500 uppercase">Pull Request</p>
              <a
                href={latestPR.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                PR #{latestPR.number}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {(['overview', 'feasibility', 'architecture', 'timeline', 'summary', 'artifacts', 'patches', 'policy', 'sandbox', 'runs', 'activity'] as const).map(tab => {
            const hasViolations = tab === 'policy' && (workflow.policyViolations?.length ?? 0) > 0;
            const hasBlockingViolations = tab === 'policy' && workflow.policyViolations?.some(v => v.severity === 'BLOCK');
            const runsCount = tab === 'runs' ? (workflow.runs?.length ?? 0) : 0;
            const eventsCount = tab === 'activity' ? (workflow.events?.length ?? 0) : 0;
            const reposCount = tab === 'architecture' ? (workflow.repos?.length ?? 0) : 0;
            const hasFeasibility = tab === 'feasibility' && workflow.artifacts?.some(a => a.kind === 'FeasibilityV1');

            // Gate-locking: determine which tabs are accessible based on current stage
            const stageOrder = ['feasibility', 'architecture', 'timeline', 'summary', 'patches', 'policy', 'sandbox', 'pr', 'done'];
            const currentStageIndex = workflow.stage ? stageOrder.indexOf(workflow.stage) : 0;

            // Map tabs to stage requirements
            const tabStageMap: Record<string, number> = {
              'overview': -1,  // Always accessible
              'feasibility': 0,
              'architecture': 1,
              'timeline': 2,
              'summary': 3,
              'artifacts': -1, // Always accessible
              'patches': 4,
              'policy': 5,
              'sandbox': 6,
              'runs': -1,  // Always accessible
              'activity': -1, // Always accessible
            };

            const tabRequiredStage = tabStageMap[tab] ?? -1;
            const isLocked = tabRequiredStage > 0 && currentStageIndex < tabRequiredStage;
            const hasArtifact = tab === 'feasibility' ? workflow.artifacts?.some(a => a.kind === 'FeasibilityV1') :
                              tab === 'architecture' ? workflow.artifacts?.some(a => a.kind === 'ArchitectureV1') :
                              tab === 'timeline' ? workflow.artifacts?.some(a => a.kind === 'TimelineV1') :
                              tab === 'summary' ? workflow.artifacts?.some(a => a.kind === 'SummaryV1') :
                              tab === 'sandbox' ? workflow.artifacts?.some(a => a.kind === 'SandboxResultV1') : false;

            return (
              <button
                key={tab}
                onClick={() => !isLocked && setActiveTab(tab)}
                disabled={isLocked}
                className={`py-2 px-1 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : isLocked
                    ? 'border-transparent text-gray-300 cursor-not-allowed'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                title={isLocked ? `Locked until ${stageOrder[tabRequiredStage]} stage is reached` : undefined}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {isLocked && <span className="text-gray-300">🔒</span>}
                {hasViolations && (
                  <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    hasBlockingViolations ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {workflow.policyViolations?.length}
                  </span>
                )}
                {runsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                    {runsCount}
                  </span>
                )}
                {eventsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                    {eventsCount}
                  </span>
                )}
                {reposCount > 1 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                    {reposCount}
                  </span>
                )}
                {(hasFeasibility || hasArtifact) && !isLocked && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-600">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <OverviewTab workflow={workflow} />}
        {activeTab === 'feasibility' && <FeasibilityTab workflow={workflow} />}
        {activeTab === 'architecture' && <ArchitectureTab workflow={workflow} />}
        {activeTab === 'timeline' && <TimelineTab workflow={workflow} />}
        {activeTab === 'summary' && <SummaryTab workflow={workflow} />}
        {activeTab === 'artifacts' && <ArtifactsTab artifacts={workflow.artifacts || []} />}
        {activeTab === 'policy' && <PolicyTab violations={workflow.policyViolations || []} />}
        {activeTab === 'sandbox' && (
          <SandboxTab
            workflow={workflow}
            canRegenerate={workflow.stage === 'sandbox' && workflow.stageStatus === 'blocked'}
            onRegenerate={() => setShowSandboxRegenerateModal(true)}
            onRetry={handleStageRetry}
          />
        )}
        {activeTab === 'patches' && (
          <PatchSetsTab
            workflowId={workflow.id}
            patchSets={workflow.patchSets || []}
            canApprove={workflow.state === 'WAITING_USER_APPROVAL'}
            onRefetch={refetch}
          />
        )}
        {activeTab === 'runs' && <RunsTab workflowId={workflow.id} runs={workflow.runs || []} />}
        {activeTab === 'activity' && <ActivityTab workflow={workflow} />}
      </div>
    </div>
  );
}

function OverviewTab({ workflow }: { workflow: Workflow }) {
  const latestPatchSet = workflow.patchSets?.[0];
  const recentEvents = workflow.events?.slice(-5) || [];
  const pullRequests = workflow.pullRequests || [];
  const approvals = workflow.approvals || [];

  // Group PRs by repo
  const prsByRepo = pullRequests.reduce((acc, pr) => {
    const key = pr.repoOwner && pr.repoName ? `${pr.repoOwner}/${pr.repoName}` : 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(pr);
    return acc;
  }, {} as Record<string, PullRequest[]>);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Current state */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Current State</h3>
        <div className="flex items-center gap-2">
          <WorkflowStatusBadge state={workflow.state} />
          <span className="text-sm text-gray-500">{workflow.state}</span>
        </div>
      </div>

      {/* Latest patch set */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Latest Patch Set</h3>
        {latestPatchSet ? (
          <div className="text-sm">
            <p className="font-medium text-gray-700">{latestPatchSet.title || 'Untitled'}</p>
            <p className="text-gray-500">
              {latestPatchSet.patches?.length || 0} patches - {latestPatchSet.status}
            </p>
            {latestPatchSet.repoOwner && latestPatchSet.repoName && (
              <p className="font-mono text-xs text-gray-400 mt-1">
                {latestPatchSet.repoOwner}/{latestPatchSet.repoName}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No patch sets yet</p>
        )}
      </div>

      {/* Pull Requests by Repo */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <GitPullRequest className="h-4 w-4" />
          Pull Requests
        </h3>
        {pullRequests.length > 0 ? (
          <div className="space-y-3">
            {Object.entries(prsByRepo).map(([repoKey, prs]) => (
              <div key={repoKey}>
                <p className="text-xs font-mono text-gray-500 mb-1">{repoKey}</p>
                <ul className="space-y-1">
                  {prs.map(pr => (
                    <li key={pr.id} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        pr.status === 'merged' ? 'bg-purple-500' :
                        pr.status === 'open' ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        PR #{pr.number}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        pr.status === 'merged' ? 'bg-purple-100 text-purple-700' :
                        pr.status === 'open' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {pr.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No pull requests yet</p>
        )}
      </div>

      {/* Approvals */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          Approvals
        </h3>
        {approvals.length > 0 ? (
          <ul className="space-y-2">
            {approvals.map(approval => (
              <li key={approval.id} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-gray-700">{approval.kind}</span>
                <span className="text-gray-400 text-xs">
                  {new Date(approval.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No approvals yet</p>
        )}
      </div>

      {/* Recent events */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 md:col-span-2">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Events</h3>
        {recentEvents.length > 0 ? (
          <ul className="space-y-2">
            {recentEvents.map(event => (
              <li key={event.id} className="flex items-center gap-3 text-sm">
                <EventIcon type={event.type} />
                <span className="font-mono text-gray-600">{event.type}</span>
                <span className="text-gray-400">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No events yet</p>
        )}
      </div>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  if (type.includes('approve')) {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
  if (type.includes('reject')) {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }
  if (type.includes('request_changes')) {
    return <MessageSquare className="h-4 w-4 text-yellow-500" />;
  }
  return <Clock className="h-4 w-4 text-gray-400" />;
}

function FeasibilityTab({ workflow }: { workflow: Workflow }) {
  const feasibilityArtifact = workflow.artifacts?.find(a => a.kind === 'FeasibilityV1');

  if (!feasibilityArtifact) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <Lightbulb className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600">Feasibility analysis not yet available</p>
        <p className="text-sm text-gray-500 mt-1">
          {workflow.stageStatus === 'processing'
            ? 'Analysis is currently running...'
            : 'Analysis will begin when the workflow starts'}
        </p>
      </div>
    );
  }

  let data: any = {};
  try {
    data = JSON.parse(feasibilityArtifact.content);
  } catch {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to parse feasibility data</p>
      </div>
    );
  }

  const recommendationColors = {
    proceed: 'bg-green-50 border-green-200 text-green-800',
    hold: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    reject: 'bg-red-50 border-red-200 text-red-800',
  };

  const recommendationIcons = {
    proceed: <CheckCircle className="h-6 w-6 text-green-500" />,
    hold: <AlertCircle className="h-6 w-6 text-yellow-500" />,
    reject: <XCircle className="h-6 w-6 text-red-500" />,
  };

  return (
    <div className="space-y-6">
      {/* Recommendation Banner */}
      <div className={`rounded-lg border p-4 ${recommendationColors[data.recommendation as keyof typeof recommendationColors] || 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-4">
          {recommendationIcons[data.recommendation as keyof typeof recommendationIcons] || <Lightbulb className="h-6 w-6 text-gray-500" />}
          <div>
            <h3 className="text-lg font-semibold capitalize">{data.recommendation || 'Unknown'}</h3>
            <p className="mt-1">{data.reasoning || 'No reasoning provided'}</p>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Feature Request</h3>
        <div className="space-y-3">
          {data.inputs?.featureGoal && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Feature Goal</p>
              <p className="text-sm text-gray-700">{data.inputs.featureGoal}</p>
            </div>
          )}
          {data.inputs?.businessJustification && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Business Justification</p>
              <p className="text-sm text-gray-700">{data.inputs.businessJustification}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Risks */}
        {data.risks?.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              Risks ({data.risks.length})
            </h3>
            <ul className="space-y-2">
              {data.risks.map((risk: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span className="text-gray-700">{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Alternatives */}
        {data.alternatives?.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Boxes className="h-4 w-4 text-blue-500" />
              Alternatives ({data.alternatives.length})
            </h3>
            <ul className="space-y-2">
              {data.alternatives.map((alt: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span className="text-gray-700">{alt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Unknowns */}
        {data.unknowns?.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              Unknowns ({data.unknowns.length})
            </h3>
            <ul className="space-y-2">
              {data.unknowns.map((unknown: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-yellow-500 mt-0.5">?</span>
                  <span className="text-gray-700">{unknown}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Assumptions */}
        {data.assumptions?.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-purple-500" />
              Assumptions ({data.assumptions.length})
            </h3>
            <ul className="space-y-2">
              {data.assumptions.map((assumption: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-purple-500 mt-0.5">•</span>
                  <span className="text-gray-700">{assumption}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
        <span>Generated: {new Date(feasibilityArtifact.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function TimelineTab({ workflow }: { workflow: Workflow }) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const timelineArtifact = workflow.artifacts?.find(a => a.kind === 'TimelineV1');

  let timelineData: any = null;
  if (timelineArtifact) {
    try {
      timelineData = JSON.parse(timelineArtifact.content);
    } catch {
      timelineData = null;
    }
  }

  const toggleEvent = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {!timelineArtifact && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
          No timeline analysis yet. Approve architecture to generate it.
        </div>
      )}

      {timelineArtifact && timelineData && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Summary</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{timelineData.summary}</p>
          </div>

          {Array.isArray(timelineData.phases) && timelineData.phases.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Phases</h3>
              <div className="space-y-4">
                {timelineData.phases.map((phase: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded p-3">
                    <div className="font-medium text-gray-900">{phase.name}</div>
                    <p className="text-sm text-gray-700 mt-1">{phase.description}</p>
                    {Array.isArray(phase.tasks) && phase.tasks.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {phase.tasks.map((task: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-800">{task.title}</span>
                              {task.estimatedComplexity && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  task.estimatedComplexity === 'high'
                                    ? 'bg-red-100 text-red-700'
                                    : task.estimatedComplexity === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {task.estimatedComplexity}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                            {Array.isArray(task.files) && task.files.length > 0 && (
                              <div className="mt-1 text-xs text-gray-500 font-mono">
                                Files: {task.files.join(', ')}
                              </div>
                            )}
                            {Array.isArray(task.dependencies) && task.dependencies.length > 0 && (
                              <div className="mt-1 text-xs text-gray-500">
                                Depends on: {task.dependencies.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(timelineData.criticalPath) && timelineData.criticalPath.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Critical Path</h3>
              <div className="flex flex-wrap gap-2">
                {timelineData.criticalPath.map((task: string, i: number) => (
                  <span key={i} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">
                    {task}
                  </span>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(timelineData.parallelizable) && timelineData.parallelizable.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Parallelizable Work</h3>
              <div className="space-y-2">
                {timelineData.parallelizable.map((group: string[], i: number) => (
                  <div key={i} className="text-xs text-gray-700">
                    Group {i + 1}: {group.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
            Generated: {new Date(timelineArtifact.createdAt).toLocaleString()}
          </div>
        </div>
      )}

      {workflow.events && workflow.events.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-900">Event Log</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {workflow.events.map(event => {
              const isExpanded = expandedEvents.has(event.id);
              return (
                <li key={event.id} className="p-4">
                  <button
                    onClick={() => toggleEvent(event.id)}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <div className="mt-1">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <EventIcon type={event.type} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-gray-900">{event.type}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </button>
                  {isExpanded && event.payload && (
                    <div className="mt-3 ml-12">
                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ArtifactsTab({ artifacts }: { artifacts: Artifact[] }) {
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);

  if (artifacts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No artifacts generated
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {artifacts.map(artifact => {
        const isExpanded = expandedArtifact === artifact.id;
        return (
          <div key={artifact.id} className="bg-white rounded-lg border border-gray-200">
            <button
              onClick={() => setExpandedArtifact(isExpanded ? null : artifact.id)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <span className="font-medium text-gray-900">{artifact.kind}</span>
                  <p className="text-xs text-gray-500">
                    {new Date(artifact.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400" />
              )}
            </button>
            {isExpanded && (
              <div className="border-t border-gray-200 p-4">
                <pre className="text-sm bg-gray-50 p-4 rounded overflow-x-auto whitespace-pre-wrap">
                  {artifact.content}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryTab({ workflow }: { workflow: Workflow }) {
  const summaryArtifact = workflow.artifacts?.find(a => a.kind === 'SummaryV1');

  let data: any = null;
  if (summaryArtifact) {
    try {
      data = JSON.parse(summaryArtifact.content);
    } catch {
      data = null;
    }
  }

  if (!summaryArtifact || !data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No summary yet. Approve timeline to generate it.
      </div>
    );
  }

  const recommendation = data.recommendation || 'hold';
  const recommendationClass =
    recommendation === 'proceed'
      ? 'bg-green-100 text-green-700'
      : 'bg-yellow-100 text-yellow-700';

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Overview</h3>
          <span className={`text-xs font-medium px-2 py-1 rounded ${recommendationClass}`}>
            {recommendation}
          </span>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.overview}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {Array.isArray(data.pros) && data.pros.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Pros</h3>
            <ul className="space-y-2">
              {data.pros.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(data.cons) && data.cons.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Cons</h3>
            <ul className="space-y-2">
              {data.cons.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {Array.isArray(data.scope) && data.scope.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Scope</h3>
            <ul className="space-y-2">
              {data.scope.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(data.risks) && data.risks.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Risks</h3>
            <ul className="space-y-2">
              {data.risks.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {Array.isArray(data.tests) && data.tests.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Tests</h3>
            <ul className="space-y-2">
              {data.tests.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-purple-500 mt-0.5">•</span>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(data.dependencies) && data.dependencies.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Dependencies</h3>
            <ul className="space-y-2">
              {data.dependencies.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-gray-500 mt-0.5">•</span>
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {Array.isArray(data.links) && data.links.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Links</h3>
          <ul className="space-y-2">
            {data.links.map((link: string, i: number) => (
              <li key={i} className="text-sm">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  {link}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
        <span>Generated: {new Date(summaryArtifact.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function SandboxTab({
  workflow,
  canRegenerate,
  onRegenerate,
  onRetry,
}: {
  workflow: Workflow;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
}) {
  const artifact = workflow.artifacts?.find(a => a.kind === 'SandboxResultV1');
  const canRetrySandbox = workflow.stage === 'sandbox' && ['ready', 'blocked', 'needs_changes'].includes(workflow.stageStatus || '');
  if (!artifact) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <div className="text-gray-500">No sandbox validation results yet.</div>
        {canRegenerate && (
          <button
            onClick={onRegenerate}
            className="mt-3 text-sm text-indigo-600 hover:underline"
          >
            Regenerate Patches with CI Feedback →
          </button>
        )}
        {canRetrySandbox && (
          <button
            onClick={onRetry}
            className="mt-3 block text-sm text-orange-600 hover:underline"
          >
            Retry Sandbox →
          </button>
        )}
      </div>
    );
  }

  let data: any = {};
  try {
    data = JSON.parse(artifact.content);
  } catch {
    data = {};
  }

  const status = data.status || data.conclusion || 'unknown';
  const isPass = status === 'pass' || status === 'success';
  const failedSteps = Array.isArray(data.failedSteps) ? data.failedSteps : [];
  const failedJobs = Array.isArray(data.failedJobs) ? data.failedJobs : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Sandbox Validation</h3>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            isPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {isPass ? 'Passed' : 'Failed'}
          </span>
        </div>

        {!isPass && (data.errorSummary || failedSteps.length > 0 || failedJobs.length > 0) && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="font-medium text-red-800 mb-1">CI Failure Summary</div>
            <div>{data.errorSummary || 'Sandbox checks failed. Review the failed jobs below.'}</div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500 uppercase text-xs mb-1">Repository</div>
            <div className="text-gray-900">{data.repo || `${workflow.repoOwner}/${workflow.repoName}`}</div>
          </div>
          <div>
            <div className="text-gray-500 uppercase text-xs mb-1">Branch</div>
            <div className="text-gray-900">{data.branch || 'sandbox branch'}</div>
          </div>
          <div>
            <div className="text-gray-500 uppercase text-xs mb-1">Run ID</div>
            <div className="text-gray-900">{data.runId || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500 uppercase text-xs mb-1">Conclusion</div>
            <div className="text-gray-900">{data.conclusion || status}</div>
          </div>
          {data.durationMs && (
            <div>
              <div className="text-gray-500 uppercase text-xs mb-1">Duration</div>
              <div className="text-gray-900">{(data.durationMs / 1000).toFixed(1)}s</div>
            </div>
          )}
          {data.patchSetId && (
            <div>
              <div className="text-gray-500 uppercase text-xs mb-1">PatchSet</div>
              <div className="text-gray-900">{data.patchSetId}</div>
            </div>
          )}
        </div>

        {!isPass && failedSteps.length > 0 && (
          <div className="mt-5">
            <div className="text-xs uppercase text-gray-500 mb-2">Failed Steps</div>
            <ul className="space-y-2 text-sm">
              {failedSteps.map((step: any, idx: number) => (
                <li key={`${step.jobName}-${step.stepName}-${idx}`} className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span className="text-gray-800">
                    <span className="font-medium">{step.jobName}</span> › {step.stepName}
                    {step.conclusion ? ` (${step.conclusion})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isPass && failedSteps.length === 0 && failedJobs.length > 0 && (
          <div className="mt-5">
            <div className="text-xs uppercase text-gray-500 mb-2">Failed Jobs</div>
            <ul className="space-y-2 text-sm">
              {failedJobs.map((job: any) => (
                <li key={job.id} className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span className="text-gray-800">
                    <span className="font-medium">{job.name}</span>
                    {job.conclusion ? ` (${job.conclusion})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {data.runUrl && (
            <a className="text-blue-600 hover:underline" href={data.runUrl} target="_blank" rel="noreferrer">
              View GitHub Actions Run →
            </a>
          )}
          {data.logsUrl && (
            <a className="text-blue-600 hover:underline" href={data.logsUrl} target="_blank" rel="noreferrer">
              View Logs →
            </a>
          )}
          {canRegenerate && (
            <button
              onClick={onRegenerate}
              className="text-indigo-600 hover:underline"
            >
              Regenerate Patches with CI Feedback →
            </button>
          )}
          {canRetrySandbox && (
            <button
              onClick={onRetry}
              className="text-orange-600 hover:underline"
            >
              Retry Sandbox →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PolicyTab({ violations }: { violations: PolicyViolation[] }) {
  if (violations.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-green-500" />
          <div>
            <h3 className="text-sm font-medium text-green-800">No Policy Violations</h3>
            <p className="text-sm text-green-700 mt-1">
              All proposed patches passed policy evaluation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const blockingViolations = violations.filter(v => v.severity === 'BLOCK');
  const warnings = violations.filter(v => v.severity === 'WARN');

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className={`rounded-lg p-4 ${
        blockingViolations.length > 0
          ? 'bg-red-50 border border-red-200'
          : 'bg-yellow-50 border border-yellow-200'
      }`}>
        <div className="flex items-center gap-3">
          <ShieldAlert className={`h-6 w-6 ${
            blockingViolations.length > 0 ? 'text-red-500' : 'text-yellow-500'
          }`} />
          <div>
            <h3 className={`text-sm font-medium ${
              blockingViolations.length > 0 ? 'text-red-800' : 'text-yellow-800'
            }`}>
              {blockingViolations.length > 0
                ? `${blockingViolations.length} Blocking Violation${blockingViolations.length > 1 ? 's' : ''}`
                : `${warnings.length} Warning${warnings.length > 1 ? 's' : ''}`}
            </h3>
            <p className={`text-sm mt-1 ${
              blockingViolations.length > 0 ? 'text-red-700' : 'text-yellow-700'
            }`}>
              {blockingViolations.length > 0
                ? 'These violations must be resolved before the patch can be applied.'
                : 'Review these warnings before approving.'}
            </p>
          </div>
        </div>
      </div>

      {/* Blocking violations */}
      {blockingViolations.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-medium text-red-700 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Blocking Violations
            </h4>
          </div>
          <ul className="divide-y divide-gray-100">
            {blockingViolations.map(violation => (
              <li key={violation.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{violation.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{violation.rule}</span>
                      {violation.file && <span className="font-mono">{violation.file}</span>}
                      {violation.line && <span>Line {violation.line}</span>}
                    </div>
                    {violation.evidence && (
                      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {violation.evidence}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-medium text-yellow-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Warnings
            </h4>
          </div>
          <ul className="divide-y divide-gray-100">
            {warnings.map(violation => (
              <li key={violation.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{violation.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{violation.rule}</span>
                      {violation.file && <span className="font-mono">{violation.file}</span>}
                      {violation.line && <span>Line {violation.line}</span>}
                    </div>
                    {violation.evidence && (
                      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {violation.evidence}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PatchSetsTab({
  workflowId,
  patchSets,
  canApprove,
  onRefetch
}: {
  workflowId: string;
  patchSets: PatchSet[];
  canApprove: boolean;
  onRefetch: () => Promise<void>;
}) {
  const [expandedPatchSet, setExpandedPatchSet] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showChangesModal, setShowChangesModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [changesComment, setChangesComment] = useState('');

  const handleApprove = async (patchSetId: string) => {
    setActionInProgress(patchSetId);
    try {
      await api.workflows.approve(workflowId, patchSetId);
      await onRefetch();
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (patchSetId: string) => {
    if (!rejectReason.trim()) return;
    setActionInProgress(patchSetId);
    try {
      await api.workflows.reject(workflowId, patchSetId, rejectReason);
      setShowRejectModal(null);
      setRejectReason('');
      await onRefetch();
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRequestChanges = async (patchSetId: string) => {
    if (!changesComment.trim()) return;
    setActionInProgress(patchSetId);
    try {
      await api.workflows.requestChanges(workflowId, patchSetId, changesComment);
      setShowChangesModal(null);
      setChangesComment('');
      await onRefetch();
    } catch (err) {
      console.error('Failed to request changes:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  if (patchSets.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No patch sets proposed
      </div>
    );
  }

  // Group PatchSets by repo for multi-repo display
  const patchSetsByRepo = patchSets.reduce((acc, ps) => {
    const repoKey = ps.repoOwner && ps.repoName ? `${ps.repoOwner}/${ps.repoName}` : 'unknown';
    if (!acc[repoKey]) acc[repoKey] = [];
    acc[repoKey].push(ps);
    return acc;
  }, {} as Record<string, PatchSet[]>);

  const repoKeys = Object.keys(patchSetsByRepo);
  const isMultiRepo = repoKeys.length > 1;

  return (
    <>
      {/* Reject Modal */}
      <Modal
        isOpen={!!showRejectModal}
        onClose={() => { setShowRejectModal(null); setRejectReason(''); }}
        title="Reject Patch Set"
      >
        <div className="space-y-4">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowRejectModal(null); setRejectReason(''); }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => showRejectModal && handleReject(showRejectModal)}
              disabled={!rejectReason.trim() || !!actionInProgress}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {actionInProgress ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject
            </button>
          </div>
        </div>
      </Modal>

      {/* Request Changes Modal */}
      <Modal
        isOpen={!!showChangesModal}
        onClose={() => { setShowChangesModal(null); setChangesComment(''); }}
        title="Request Changes"
      >
        <div className="space-y-4">
          <textarea
            value={changesComment}
            onChange={(e) => setChangesComment(e.target.value)}
            placeholder="Describe the changes needed..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowChangesModal(null); setChangesComment(''); }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => showChangesModal && handleRequestChanges(showChangesModal)}
              disabled={!changesComment.trim() || !!actionInProgress}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              {actionInProgress ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              Request Changes
            </button>
          </div>
        </div>
      </Modal>

      <div className="space-y-6">
        {repoKeys.map(repoKey => {
          const repoPatchSets = patchSetsByRepo[repoKey];
          return (
            <div key={repoKey}>
              {/* Repo header for multi-repo workflows */}
              {isMultiRepo && (
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="h-4 w-4 text-blue-500" />
                  <span className="font-mono text-sm font-medium text-blue-700">{repoKey}</span>
                  <span className="text-xs text-gray-500">({repoPatchSets.length} patch set{repoPatchSets.length !== 1 ? 's' : ''})</span>
                </div>
              )}

              <div className="space-y-4">
                {repoPatchSets.map(patchSet => {
                  const isExpanded = expandedPatchSet === patchSet.id;
                  const isProposed = patchSet.status === 'proposed';
                  const isLoading = actionInProgress === patchSet.id;

                  return (
                    <div key={patchSet.id} className="bg-white rounded-lg border border-gray-200">
                      <div className="p-4 flex items-center justify-between">
                        <button
                          onClick={() => setExpandedPatchSet(isExpanded ? null : patchSet.id)}
                          className="flex items-center gap-3 text-left flex-1"
                        >
                          <GitBranch className="h-5 w-5 text-gray-400" />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {patchSet.title && (
                                <span className="font-medium text-gray-900">{patchSet.title}</span>
                              )}
                              {!isMultiRepo && patchSet.repoOwner && patchSet.repoName && (
                                <span className="font-mono text-xs text-gray-500">
                                  {patchSet.repoOwner}/{patchSet.repoName}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                patchSet.status === 'approved'
                                  ? 'bg-green-100 text-green-700'
                                  : patchSet.status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : patchSet.status === 'applied'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {patchSet.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {patchSet.patches?.length || 0} patch{(patchSet.patches?.length || 0) !== 1 ? 'es' : ''} • Base: {patchSet.baseSha?.substring(0, 7) || '-'}
                              {patchSet.approvedBy && (
                                <span className="ml-2">• Approved by {patchSet.approvedBy}</span>
                              )}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          {/* Per-PatchSet action buttons */}
                          {canApprove && isProposed && (
                            <>
                              <button
                                onClick={() => setShowChangesModal(patchSet.id)}
                                disabled={isLoading}
                                className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded disabled:opacity-50"
                                title="Request Changes"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setShowRejectModal(patchSet.id)}
                                disabled={isLoading}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                title="Reject"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleApprove(patchSet.id)}
                                disabled={isLoading}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {isLoading ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3 w-3" />
                                )}
                                Approve
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => setExpandedPatchSet(isExpanded ? null : patchSet.id)}
                            className="p-1"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded && patchSet.patches && patchSet.patches.length > 0 && (
                        <div className="border-t border-gray-200">
                          <ul className="divide-y divide-gray-100">
                            {patchSet.patches.map((patch: Patch) => (
                              <li key={patch.id} className="p-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <Link
                                      to={`/patches/${patch.id}`}
                                      className="font-mono text-sm text-blue-600 hover:underline"
                                    >
                                      {patch.title || patch.filePath || 'Untitled patch'}
                                    </Link>
                                    {patch.summary && (
                                      <p className="text-sm text-gray-600 mt-1">{patch.summary}</p>
                                    )}
                                    {patch.files && patch.files.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {patch.files.map((f, i) => (
                                          <span key={i} className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                            {f.path}
                                            <span className="text-green-600 ml-1">+{f.additions}</span>
                                            <span className="text-red-600 ml-1">-{f.deletions}</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {patch.riskLevel && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      patch.riskLevel === 'high'
                                        ? 'bg-red-100 text-red-700'
                                        : patch.riskLevel === 'medium'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-green-100 text-green-700'
                                    }`}>
                                      {patch.riskLevel}
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RunsTab({ workflowId, runs }: { workflowId: string; runs: WorkflowRun[] }) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No workflow runs recorded yet
      </div>
    );
  }

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-4">
      {/* Cost Summary */}
      <CostSummary workflowId={workflowId} />

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Runs</p>
          <p className="text-2xl font-bold text-gray-900">{runs.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Completed</p>
          <p className="text-2xl font-bold text-green-600">
            {runs.filter(r => r.status === 'completed').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Failed</p>
          <p className="text-2xl font-bold text-red-600">
            {runs.filter(r => r.status === 'failed').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Tokens</p>
          <p className="text-2xl font-bold text-blue-600">
            {runs.reduce((sum, r) => sum + (r.totalTokens || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Runs list */}
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {runs.map(run => {
          const isExpanded = expandedRun === run.id;
          return (
            <div key={run.id}>
              <button
                onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    run.status === 'completed' ? 'bg-green-500' :
                    run.status === 'failed' ? 'bg-red-500' :
                    run.status === 'running' ? 'bg-blue-500 animate-pulse' :
                    'bg-gray-400'
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{run.jobName}</span>
                      {run.agentRole && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                          {run.agentRole}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        run.status === 'completed' ? 'bg-green-100 text-green-700' :
                        run.status === 'failed' ? 'bg-red-100 text-red-700' :
                        run.status === 'running' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                      {run.durationMs && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {formatDuration(run.durationMs)}
                        </span>
                      )}
                      {run.totalTokens && (
                        <span>{run.totalTokens.toLocaleString()} tokens</span>
                      )}
                    </div>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Error message */}
                  {run.errorMsg && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <p className="text-sm text-red-700 font-mono">{run.errorMsg}</p>
                    </div>
                  )}

                  {/* Inputs */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Inputs</p>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(run.inputs, null, 2)}
                    </pre>
                  </div>

                  {/* Outputs */}
                  {run.outputs && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Outputs</p>
                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                        {JSON.stringify(run.outputs, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Token usage */}
                  {(run.inputTokens || run.outputTokens) && (
                    <div className="flex gap-4 text-xs">
                      {run.inputTokens && (
                        <span className="text-gray-600">
                          Input: <strong>{run.inputTokens.toLocaleString()}</strong> tokens
                        </span>
                      )}
                      {run.outputTokens && (
                        <span className="text-gray-600">
                          Output: <strong>{run.outputTokens.toLocaleString()}</strong> tokens
                        </span>
                      )}
                      {run.estimatedCost && (
                        <span className="text-gray-600">
                          Cost: <strong>${(run.estimatedCost / 100).toFixed(4)}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Activity/Timeline tab - shows workflow events in a vertical timeline
function ActivityTab({ workflow }: { workflow: Workflow }) {
  const events = workflow.events || [];
  const runs = workflow.runs || [];
  const decisions = workflow.stageDecisions || [];

  // Combine events, runs, and decisions into a unified timeline
  type TimelineItem = {
    id: string;
    type: 'event' | 'run' | 'decision';
    timestamp: string;
    data: WorkflowEvent | WorkflowRun | StageDecision;
  };

  const timelineItems: TimelineItem[] = [
    ...events.map(e => ({ id: e.id, type: 'event' as const, timestamp: e.createdAt, data: e })),
    ...runs.map(r => ({ id: r.id, type: 'run' as const, timestamp: r.startedAt, data: r })),
    ...decisions.map(d => ({ id: d.id, type: 'decision' as const, timestamp: d.createdAt, data: d })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (timelineItems.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        <History className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        No activity recorded yet
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    if (type.includes('created') || type.includes('started')) return <Play className="h-4 w-4" />;
    if (type.includes('completed') || type.includes('approved') || type.includes('done')) return <CheckCircle className="h-4 w-4" />;
    if (type.includes('failed') || type.includes('rejected') || type.includes('error')) return <XCircle className="h-4 w-4" />;
    if (type.includes('stage') && type.includes('transition')) return <ArrowLeft className="h-4 w-4 rotate-180" />;
    if (type.includes('policy')) return <Shield className="h-4 w-4" />;
    if (type.includes('patch')) return <FileDiff className="h-4 w-4" />;
    if (type.includes('context')) return <FileText className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  const getEventColor = (item: TimelineItem) => {
    if (item.type === 'decision') {
      const decision = item.data as StageDecision;
      if (decision.decision === 'approve') return 'bg-green-500';
      if (decision.decision === 'reject') return 'bg-red-500';
      return 'bg-yellow-500';
    }
    if (item.type === 'run') {
      const run = item.data as WorkflowRun;
      if (run.status === 'completed') return 'bg-green-500';
      if (run.status === 'failed') return 'bg-red-500';
      if (run.status === 'running') return 'bg-blue-500';
      return 'bg-gray-400';
    }
    const event = item.data as WorkflowEvent;
    if (event.type.includes('completed') || event.type.includes('approved') || event.type.includes('done')) return 'bg-green-500';
    if (event.type.includes('failed') || event.type.includes('rejected') || event.type.includes('error')) return 'bg-red-500';
    if (event.type.includes('blocked')) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const formatEventType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\./g, ' → ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
        <History className="h-5 w-5 text-gray-400" />
        <h3 className="font-medium text-gray-900">Activity Timeline</h3>
        <span className="text-xs text-gray-500">({timelineItems.length} events)</span>
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        {/* Timeline items */}
        <div className="space-y-4">
          {timelineItems.map((item) => (
            <div key={item.id} className="relative flex gap-4 pl-10">
              {/* Dot on timeline */}
              <div className={`absolute left-2.5 w-3 h-3 rounded-full ${getEventColor(item)} ring-2 ring-white`} />

              {/* Content */}
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400">
                      {item.type === 'event' && getEventIcon((item.data as WorkflowEvent).type)}
                      {item.type === 'run' && <Play className="h-4 w-4" />}
                      {item.type === 'decision' && (
                        (item.data as StageDecision).decision === 'approve' ? <ThumbsUp className="h-4 w-4" /> :
                        (item.data as StageDecision).decision === 'reject' ? <ThumbsDown className="h-4 w-4" /> :
                        <Edit3 className="h-4 w-4" />
                      )}
                    </span>
                    <span className="font-medium text-gray-900 truncate">
                      {item.type === 'event' && formatEventType((item.data as WorkflowEvent).type)}
                      {item.type === 'run' && (item.data as WorkflowRun).jobName}
                      {item.type === 'decision' && `Stage ${(item.data as StageDecision).stage} ${(item.data as StageDecision).decision}d`}
                    </span>
                    {item.type === 'run' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        (item.data as WorkflowRun).status === 'completed' ? 'bg-green-100 text-green-700' :
                        (item.data as WorkflowRun).status === 'failed' ? 'bg-red-100 text-red-700' :
                        (item.data as WorkflowRun).status === 'running' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {(item.data as WorkflowRun).status}
                      </span>
                    )}
                    {item.type === 'decision' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        (item.data as StageDecision).decision === 'approve' ? 'bg-green-100 text-green-700' :
                        (item.data as StageDecision).decision === 'reject' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {(item.data as StageDecision).stage}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>

                {/* Additional details */}
                {item.type === 'event' && Object.keys((item.data as WorkflowEvent).payload || {}).length > 0 && (
                  <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2 font-mono overflow-x-auto">
                    {JSON.stringify((item.data as WorkflowEvent).payload, null, 2).slice(0, 200)}
                    {JSON.stringify((item.data as WorkflowEvent).payload).length > 200 && '...'}
                  </div>
                )}

                {item.type === 'run' && (item.data as WorkflowRun).errorMsg && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">
                    {(item.data as WorkflowRun).errorMsg}
                  </div>
                )}

                {item.type === 'run' && (item.data as WorkflowRun).durationMs && (
                  <div className="mt-1 text-xs text-gray-500">
                    Duration: {((item.data as WorkflowRun).durationMs! / 1000).toFixed(1)}s
                    {(item.data as WorkflowRun).totalTokens && ` • ${(item.data as WorkflowRun).totalTokens?.toLocaleString()} tokens`}
                  </div>
                )}

                {item.type === 'decision' && (item.data as StageDecision).reason && (
                  <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                    "{(item.data as StageDecision).reason}"
                  </div>
                )}

                {item.type === 'decision' && (item.data as StageDecision).actorName && (
                  <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {(item.data as StageDecision).actorName}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Stage pipeline component
const STAGES: { key: GatedStage; label: string; icon: typeof Lightbulb }[] = [
  { key: 'feasibility', label: 'Feasibility', icon: Lightbulb },
  { key: 'architecture', label: 'Architecture', icon: Boxes },
  { key: 'timeline', label: 'Timeline', icon: CalendarClock },
  { key: 'summary', label: 'Summary', icon: FileText },
  { key: 'patches', label: 'Patches', icon: FileDiff },
  { key: 'policy', label: 'Policy', icon: Shield },
  { key: 'sandbox', label: 'Sandbox', icon: ShieldCheck },
  { key: 'pr', label: 'PR', icon: Rocket },
];

// Threshold for considering a stage "stuck" (10 minutes in ms)
const STUCK_THRESHOLD_MS = 10 * 60 * 1000;

function StagePipeline({
  stage,
  stageStatus,
  stageUpdatedAt,
  hasBlockingViolations,
  sandboxFailed,
  onJumpToSandbox,
  onStageSelect,
  onApprove,
  onReject,
  onRequestChanges,
  onRetry,
  isLoading,
}: {
  stage: GatedStage;
  stageStatus: StageStatus;
  stageUpdatedAt?: string;
  hasBlockingViolations: boolean;
  sandboxFailed: boolean;
  onJumpToSandbox: () => void;
  onStageSelect: (stage: GatedStage) => void;
  onApprove: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  onRetry: () => void;
  isLoading: boolean;
}) {
  const currentIndex = STAGES.findIndex(s => s.key === stage);
  const isTerminal = stage === 'done' || stageStatus === 'rejected';
  const isPolicyBlocked = stage === 'policy' && hasBlockingViolations;
  const canTakeAction = stageStatus === 'ready' && !isLoading && !isPolicyBlocked;

  // Detect stuck stages (processing for too long)
  const isStuck = stageStatus === 'processing' && stageUpdatedAt
    ? (Date.now() - new Date(stageUpdatedAt).getTime()) > STUCK_THRESHOLD_MS
    : false;

  const canRetry = (['needs_changes', 'blocked', 'ready'].includes(stageStatus) || isStuck) && !isLoading;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Stage progress bar */}
      <div className="flex items-center justify-between mb-4">
        {STAGES.map((s, idx) => {
          const Icon = s.icon;
          const isPast = idx < currentIndex;
          const isCurrent = s.key === stage;
          const isPolicyStageBlocked = s.key === 'policy' && isCurrent && isPolicyBlocked;

          let statusClass = 'bg-gray-100 text-gray-400 border-gray-200';
          let showCheckmark = false;

          if (isPast || (isCurrent && stageStatus === 'approved')) {
            statusClass = 'bg-green-50 text-green-700 border-green-200';
            showCheckmark = true;
          } else if (isCurrent) {
            if (isPolicyStageBlocked) {
              statusClass = 'bg-red-50 text-red-700 border-red-300 ring-2 ring-red-200';
            } else if (stageStatus === 'processing') {
              statusClass = 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-200';
            } else if (stageStatus === 'ready') {
              statusClass = 'bg-yellow-50 text-yellow-700 border-yellow-300 ring-2 ring-yellow-200';
            } else if (stageStatus === 'rejected') {
              statusClass = 'bg-red-50 text-red-700 border-red-300 ring-2 ring-red-200';
            } else if (stageStatus === 'blocked' || stageStatus === 'needs_changes') {
              statusClass = 'bg-orange-50 text-orange-700 border-orange-300 ring-2 ring-orange-200';
            } else {
              statusClass = 'bg-gray-100 text-gray-600 border-gray-300';
            }
          }

          return (
            <div key={s.key} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => onStageSelect(s.key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all ${statusClass} hover:opacity-90`}
              >
                {showCheckmark ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : isCurrent && stageStatus === 'processing' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : isPolicyStageBlocked ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline font-medium">{s.label}</span>
                {s.key === 'patches' && sandboxFailed && (
                  <span
                    className="ml-1 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 border border-red-200"
                    title="View CI feedback in Sandbox tab"
                  >
                    CI Feedback
                  </span>
                )}
              </button>
              {s.key === 'patches' && sandboxFailed && (
                <button
                  type="button"
                  onClick={onJumpToSandbox}
                  className="ml-2 text-[11px] text-red-600 hover:underline"
                  title="Go to Sandbox tab"
                >
                  View →
                </button>
              )}
              {idx < STAGES.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 transition-colors ${isPast ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current stage info and actions */}
      {!isTerminal && (
        <div className={`rounded-lg p-4 ${
          isStuck
            ? 'bg-red-50 border border-red-200'
            : stageStatus === 'ready' && isPolicyBlocked
            ? 'bg-red-50 border border-red-200'
            : stageStatus === 'ready'
            ? 'bg-yellow-50 border border-yellow-200'
            : stageStatus === 'processing'
            ? 'bg-blue-50 border border-blue-200'
            : stageStatus === 'needs_changes'
            ? 'bg-orange-50 border border-orange-200'
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isStuck && (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              )}
              {stageStatus === 'processing' && !isStuck && (
                <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
              )}
              {stageStatus === 'ready' && isPolicyBlocked && (
                <ShieldAlert className="h-5 w-5 text-red-500" />
              )}
              {stageStatus === 'ready' && !isPolicyBlocked && (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              {stageStatus === 'needs_changes' && (
                <MessageSquare className="h-5 w-5 text-orange-500" />
              )}
              {stageStatus === 'blocked' && (
                <AlertCircle className="h-5 w-5 text-orange-500" />
              )}
              {stageStatus === 'pending' && (
                <Clock className="h-5 w-5 text-gray-400" />
              )}
              <div>
                <h3 className={`text-sm font-medium ${
                  isStuck ? 'text-red-800' :
                  stageStatus === 'ready' && isPolicyBlocked ? 'text-red-800' :
                  stageStatus === 'ready' ? 'text-yellow-800' :
                  stageStatus === 'processing' ? 'text-blue-800' :
                  stageStatus === 'needs_changes' ? 'text-orange-800' :
                  'text-gray-700'
                }`}>
                  {isStuck && `${stage.charAt(0).toUpperCase() + stage.slice(1)} stage appears stuck`}
                  {!isStuck && stageStatus === 'ready' && isPolicyBlocked && 'Policy has blocking violations'}
                  {!isStuck && stageStatus === 'ready' && !isPolicyBlocked && `${stage.charAt(0).toUpperCase() + stage.slice(1)} analysis ready for review`}
                  {!isStuck && stageStatus === 'processing' && `Running ${stage} analysis...`}
                  {stageStatus === 'needs_changes' && `${stage.charAt(0).toUpperCase() + stage.slice(1)} stage needs changes`}
                  {stageStatus === 'blocked' && `${stage.charAt(0).toUpperCase() + stage.slice(1)} stage blocked`}
                  {stageStatus === 'pending' && `Waiting to start ${stage} stage`}
                </h3>
                <p className={`text-sm ${
                  isStuck ? 'text-red-700' :
                  stageStatus === 'ready' && isPolicyBlocked ? 'text-red-700' :
                  stageStatus === 'ready' ? 'text-yellow-700' :
                  stageStatus === 'processing' ? 'text-blue-700' :
                  stageStatus === 'needs_changes' ? 'text-orange-700' :
                  stageStatus === 'blocked' ? 'text-orange-700' :
                  'text-gray-500'
                }`}>
                  {isStuck && 'This stage has been processing for over 10 minutes. Click Retry to restart.'}
                  {!isStuck && stageStatus === 'ready' && isPolicyBlocked && 'Resolve blocking violations in the Policy tab before approving.'}
                  {!isStuck && stageStatus === 'ready' && !isPolicyBlocked && 'Review the analysis and approve to proceed to the next stage.'}
                  {!isStuck && stageStatus === 'processing' && 'Please wait while the analysis is being generated.'}
                  {stageStatus === 'needs_changes' && 'Update feedback or retry the stage to re-run the analysis.'}
                  {stageStatus === 'blocked' && 'This stage was blocked due to an error. Retry to re-run the analysis.'}
                  {stageStatus === 'pending' && 'The previous stage needs to be approved first.'}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            {canTakeAction && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onRequestChanges}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-yellow-700 border border-yellow-300 rounded-md hover:bg-yellow-100 disabled:opacity-50"
                >
                  <MessageSquare className="h-4 w-4" />
                  Request Changes
                </button>
                <button
                  onClick={onReject}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-md hover:bg-red-100 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={onApprove}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Approve
                </button>
              </div>
            )}

            {canRetry && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onRetry}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-700 border border-orange-300 rounded-md hover:bg-orange-100 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Stage
                </button>
              </div>
            )}

            {/* Policy blocked due to violations */}
            {isPolicyBlocked && stageStatus === 'ready' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" />
                  Approval blocked - resolve violations first
                </span>
                <button
                  onClick={onRequestChanges}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-yellow-700 border border-yellow-300 rounded-md hover:bg-yellow-100 disabled:opacity-50"
                >
                  <MessageSquare className="h-4 w-4" />
                  Request Changes
                </button>
                <button
                  onClick={onReject}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-md hover:bg-red-100 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  disabled
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-300 text-gray-500 rounded-md cursor-not-allowed"
                  title="Resolve blocking violations before approving"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal states */}
      {stage === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <h3 className="text-sm font-medium text-green-800">Workflow Complete</h3>
              <p className="text-sm text-green-700">All stages have been approved and the PR has been created.</p>
            </div>
          </div>
        </div>
      )}

      {stageStatus === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Workflow Rejected</h3>
              <p className="text-sm text-red-700">This workflow was rejected at the {stage} stage.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchitectureTab({ workflow }: { workflow: Workflow }) {
  const repos = workflow.repos || [];
  const patchSets = workflow.patchSets || [];
  const architectureArtifact = workflow.artifacts?.find(a => a.kind === 'ArchitectureV1');

  let architectureData: any = null;
  if (architectureArtifact) {
    try {
      architectureData = JSON.parse(architectureArtifact.content);
    } catch {
      architectureData = null;
    }
  }

  // Aggregate file changes across all patches
  const fileChanges: Record<string, { path: string; additions: number; deletions: number; repo: string }> = {};
  patchSets.forEach(ps => {
    const repoKey = ps.repoOwner && ps.repoName ? `${ps.repoOwner}/${ps.repoName}` : 'unknown';
    ps.patches?.forEach(patch => {
      patch.files?.forEach(file => {
        const key = `${repoKey}:${file.path}`;
        if (fileChanges[key]) {
          fileChanges[key].additions += file.additions;
          fileChanges[key].deletions += file.deletions;
        } else {
          fileChanges[key] = { path: file.path, additions: file.additions, deletions: file.deletions, repo: repoKey };
        }
      });
    });
  });

  const allFiles = Object.values(fileChanges);

  // Group files by directory
  const filesByDir: Record<string, typeof allFiles> = {};
  allFiles.forEach(file => {
    const dir = file.path.split('/').slice(0, -1).join('/') || '/';
    if (!filesByDir[dir]) filesByDir[dir] = [];
    filesByDir[dir].push(file);
  });

  // Calculate totals
  const totalAdditions = allFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = allFiles.reduce((sum, f) => sum + f.deletions, 0);
  const totalFiles = allFiles.length;

  return (
    <div className="space-y-6">
      {!architectureArtifact && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
          No architecture analysis yet. Approve feasibility to generate it.
        </div>
      )}

      {architectureArtifact && architectureData && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Overview</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{architectureData.overview}</p>
          </div>

          {Array.isArray(architectureData.components) && architectureData.components.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Components</h3>
              <div className="space-y-3">
                {architectureData.components.map((component: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded p-3">
                    <div className="font-medium text-gray-900">{component.name}</div>
                    <p className="text-sm text-gray-700 mt-1">{component.description}</p>
                    {component.files?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 uppercase mb-1">Files</p>
                        <div className="flex flex-wrap gap-1">
                          {component.files.map((file: string, i: number) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
                              {file}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {component.dependencies?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 uppercase mb-1">Dependencies</p>
                        <div className="flex flex-wrap gap-1">
                          {component.dependencies.map((dep: string, i: number) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              {dep}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {architectureData.dataFlow && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Data Flow</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{architectureData.dataFlow}</p>
            </div>
          )}

          {Array.isArray(architectureData.integrationPoints) && architectureData.integrationPoints.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Integration Points</h3>
              <ul className="space-y-1 text-sm text-gray-700">
                {architectureData.integrationPoints.map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(architectureData.technicalDecisions) && architectureData.technicalDecisions.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Technical Decisions</h3>
              <div className="space-y-3">
                {architectureData.technicalDecisions.map((decision: any, i: number) => (
                  <div key={i} className="border border-gray-200 rounded p-3">
                    <div className="font-medium text-gray-900">{decision.decision}</div>
                    <p className="text-sm text-gray-700 mt-1">{decision.rationale}</p>
                    {Array.isArray(decision.alternatives) && decision.alternatives.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        Alternatives: {decision.alternatives.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
            Generated: {new Date(architectureArtifact.createdAt).toLocaleString()}
          </div>
        </div>
      )}

      {/* Multi-repo topology */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Repository Topology
        </h3>
        {repos.length > 0 ? (
          <div className="space-y-4">
            {/* Primary repo */}
            {repos.filter(r => r.role === 'primary').map(repo => (
              <div key={repo.id} className="relative pl-6">
                <div className="absolute left-0 top-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <Package className="h-2.5 w-2.5 text-white" />
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-blue-700">{repo.owner}/{repo.repo}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded">primary</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-blue-600">
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5" />
                      {repo.baseBranch}
                    </span>
                    {repo.baseSha && (
                      <span className="font-mono text-xs">{repo.baseSha.substring(0, 7)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Secondary repos */}
            {repos.filter(r => r.role !== 'primary').map((repo) => (
              <div key={repo.id} className="relative pl-6 ml-6">
                <div className="absolute -left-6 top-0 bottom-0 border-l-2 border-gray-300" />
                <div className="absolute left-0 top-2 w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
                  <Package className="h-2.5 w-2.5 text-white" />
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-gray-700">{repo.owner}/{repo.repo}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">secondary</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5" />
                      {repo.baseBranch}
                    </span>
                    {repo.baseSha && (
                      <span className="font-mono text-xs">{repo.baseSha.substring(0, 7)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No repositories configured</p>
        )}
      </div>

      {/* Change scope summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
          <FileCode className="h-4 w-4" />
          Change Scope
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalFiles}</p>
            <p className="text-xs text-gray-500 uppercase">Files Changed</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">+{totalAdditions}</p>
            <p className="text-xs text-gray-500 uppercase">Additions</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">-{totalDeletions}</p>
            <p className="text-xs text-gray-500 uppercase">Deletions</p>
          </div>
        </div>
      </div>

      {/* File tree */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
          <FolderTree className="h-4 w-4" />
          Affected Files by Directory
        </h3>
        {Object.keys(filesByDir).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(filesByDir)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dir, files]) => (
              <div key={dir}>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FolderTree className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="font-mono">{dir || '/'}</span>
                  <span className="text-xs text-gray-400">({files.length} file{files.length !== 1 ? 's' : ''})</span>
                </div>
                <ul className="ml-5 space-y-1">
                  {files.map((file, idx) => {
                    const fileName = file.path.split('/').pop();
                    return (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <FileCode className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-mono text-gray-600">{fileName}</span>
                        <span className="text-xs text-green-600">+{file.additions}</span>
                        <span className="text-xs text-red-600">-{file.deletions}</span>
                        {repos.length > 1 && (
                          <span className="text-xs text-gray-400 font-mono">({file.repo})</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No file changes recorded yet</p>
        )}
      </div>

      {/* PatchSet status by repo */}
      {repos.length > 1 && patchSets.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-4">PatchSet Status by Repository</h3>
          <div className="space-y-3">
            {repos.map(repo => {
              const repoKey = `${repo.owner}/${repo.repo}`;
              const repoPatchSets = patchSets.filter(ps =>
                ps.repoOwner === repo.owner && ps.repoName === repo.repo
              );
              const proposed = repoPatchSets.filter(ps => ps.status === 'proposed').length;
              const approved = repoPatchSets.filter(ps => ps.status === 'approved').length;
              const applied = repoPatchSets.filter(ps => ps.status === 'applied').length;
              const rejected = repoPatchSets.filter(ps => ps.status === 'rejected').length;

              return (
                <div key={repo.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="font-mono text-sm text-gray-700">{repoKey}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {proposed > 0 && (
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                        {proposed} proposed
                      </span>
                    )}
                    {approved > 0 && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                        {approved} approved
                      </span>
                    )}
                    {applied > 0 && (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {applied} applied
                      </span>
                    )}
                    {rejected > 0 && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                        {rejected} rejected
                      </span>
                    )}
                    {repoPatchSets.length === 0 && (
                      <span className="text-gray-400">No patch sets</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

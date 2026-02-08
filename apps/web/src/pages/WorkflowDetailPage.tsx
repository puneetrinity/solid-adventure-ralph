import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
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
} from 'lucide-react';
import { useWorkflow } from '../hooks/use-workflow';
import { WorkflowStatusBadge } from '../components/workflow';
import { Modal } from '../components/ui';
import { api } from '../api/client';
import type { Workflow, WorkflowEvent, Artifact, PatchSet, Patch, PolicyViolation, PullRequest, WorkflowRun } from '../types';

export function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workflow, isLoading, error, refetch, isPolling, lastUpdated } = useWorkflow(id!);
  const [activeTab, setActiveTab] = useState<'overview' | 'architecture' | 'timeline' | 'artifacts' | 'policy' | 'patches' | 'runs'>('overview');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canCancel = workflow && ['INGESTED', 'PATCHES_PROPOSED', 'WAITING_USER_APPROVAL', 'APPLYING_PATCHES', 'PR_OPEN', 'VERIFYING_CI'].includes(workflow.state);

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

      {/* Goal & Context */}
      {(workflow.goal || workflow.context) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          {workflow.goal && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Goal</p>
              <p className="text-sm text-gray-900">{workflow.goal}</p>
            </div>
          )}
          {workflow.context && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Context</p>
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
          {(['overview', 'architecture', 'timeline', 'artifacts', 'policy', 'patches', 'runs'] as const).map(tab => {
            const hasViolations = tab === 'policy' && (workflow.policyViolations?.length ?? 0) > 0;
            const hasBlockingViolations = tab === 'policy' && workflow.policyViolations?.some(v => v.severity === 'BLOCK');
            const runsCount = tab === 'runs' ? (workflow.runs?.length ?? 0) : 0;
            const reposCount = tab === 'architecture' ? (workflow.repos?.length ?? 0) : 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                {reposCount > 1 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                    {reposCount}
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
        {activeTab === 'architecture' && <ArchitectureTab workflow={workflow} />}
        {activeTab === 'timeline' && <TimelineTab events={workflow.events || []} />}
        {activeTab === 'artifacts' && <ArtifactsTab artifacts={workflow.artifacts || []} />}
        {activeTab === 'policy' && <PolicyTab violations={workflow.policyViolations || []} />}
        {activeTab === 'patches' && (
          <PatchSetsTab
            workflowId={workflow.id}
            patchSets={workflow.patchSets || []}
            canApprove={workflow.state === 'WAITING_USER_APPROVAL'}
            onRefetch={refetch}
          />
        )}
        {activeTab === 'runs' && <RunsTab runs={workflow.runs || []} />}
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

function TimelineTab({ events }: { events: WorkflowEvent[] }) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

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

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No events recorded
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <ul className="divide-y divide-gray-200">
        {events.map(event => {
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

function RunsTab({ runs }: { runs: WorkflowRun[] }) {
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

function ArchitectureTab({ workflow }: { workflow: Workflow }) {
  const repos = workflow.repos || [];
  const patchSets = workflow.patchSets || [];

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

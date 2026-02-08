import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
} from 'lucide-react';
import { useWorkflow } from '../hooks/use-workflow';
import { WorkflowStatusBadge } from '../components/workflow';
import { Toast, useToast, Modal } from '../components/ui';
import { api } from '../api/client';
import type { Workflow, WorkflowEvent, Artifact, PatchSet, Patch, PolicyViolation } from '../types';

export function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workflow, isLoading, error, refetch, isPolling, lastUpdated } = useWorkflow(id!);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'artifacts' | 'policy' | 'patches'>('overview');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRequestChangesModal, setShowRequestChangesModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [changesComment, setChangesComment] = useState('');
  const { toast, showToast, hideToast } = useToast();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const shortenSha = (sha: string | null | undefined) => {
    if (!sha) return '-';
    return sha.substring(0, 7);
  };

  const handleApprove = async () => {
    if (!workflow) return;

    const latestPatchSet = workflow.patchSets?.[0];
    if (!latestPatchSet) {
      showToast('No patch set to approve', 'error');
      return;
    }

    setIsApproving(true);
    try {
      await api.workflows.approve(workflow.id, latestPatchSet.id);
      showToast('Approval submitted successfully!', 'success');
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to approve workflow',
        'error'
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!workflow) return;

    const latestPatchSet = workflow.patchSets?.[0];
    if (!latestPatchSet) {
      showToast('No patch set to reject', 'error');
      return;
    }

    if (!rejectReason.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }

    setIsRejecting(true);
    try {
      await api.workflows.reject(workflow.id, latestPatchSet.id, rejectReason);
      showToast('Patch set rejected', 'success');
      setShowRejectModal(false);
      setRejectReason('');
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to reject patch set',
        'error'
      );
    } finally {
      setIsRejecting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!workflow) return;

    const latestPatchSet = workflow.patchSets?.[0];
    if (!latestPatchSet) {
      showToast('No patch set found', 'error');
      return;
    }

    if (!changesComment.trim()) {
      showToast('Please provide feedback for the changes', 'error');
      return;
    }

    setIsRequestingChanges(true);
    try {
      await api.workflows.requestChanges(workflow.id, latestPatchSet.id, changesComment);
      showToast('Change request submitted', 'success');
      setShowRequestChangesModal(false);
      setChangesComment('');
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to request changes',
        'error'
      );
    } finally {
      setIsRequestingChanges(false);
    }
  };

  // Check if approval/rejection is available
  const canApprove = workflow?.state === 'WAITING_USER_APPROVAL' &&
    workflow.patchSets?.some(ps => ps.status === 'proposed');

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
      {/* Toast notification */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Patch Set"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Please provide a reason for rejecting this patch set.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRejectModal(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={isRejecting || !rejectReason.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {isRejecting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Reject
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Request Changes Modal */}
      <Modal
        isOpen={showRequestChangesModal}
        onClose={() => setShowRequestChangesModal(false)}
        title="Request Changes"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Describe what changes you'd like to see in this patch set.
          </p>
          <textarea
            value={changesComment}
            onChange={(e) => setChangesComment(e.target.value)}
            placeholder="Describe the changes needed..."
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRequestChangesModal(false)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleRequestChanges}
              disabled={isRequestingChanges || !changesComment.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              {isRequestingChanges ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  Request Changes
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

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

          {/* Action buttons when awaiting approval */}
          {canApprove && (
            <>
              <button
                onClick={() => setShowRequestChangesModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
              >
                <MessageSquare className="h-4 w-4" />
                Request Changes
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApproving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </>
                )}
              </button>
            </>
          )}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Approval banner when waiting */}
      {workflow.state === 'WAITING_USER_APPROVAL' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Awaiting Your Approval</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Review the proposed patches and click "Approve" to proceed, or request changes/reject if revisions are needed.
              </p>
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
                PR #{latestPR.prNumber}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {(['overview', 'timeline', 'artifacts', 'policy', 'patches'] as const).map(tab => {
            const hasViolations = tab === 'policy' && (workflow.policyViolations?.length ?? 0) > 0;
            const hasBlockingViolations = tab === 'policy' && workflow.policyViolations?.some(v => v.severity === 'BLOCK');
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
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <OverviewTab workflow={workflow} />}
        {activeTab === 'timeline' && <TimelineTab events={workflow.events || []} />}
        {activeTab === 'artifacts' && <ArtifactsTab artifacts={workflow.artifacts || []} />}
        {activeTab === 'policy' && <PolicyTab violations={workflow.policyViolations || []} />}
        {activeTab === 'patches' && <PatchSetsTab patchSets={workflow.patchSets || []} />}
      </div>
    </div>
  );
}

function OverviewTab({ workflow }: { workflow: Workflow }) {
  const latestPatchSet = workflow.patchSets?.[0];
  const recentEvents = workflow.events?.slice(-5) || [];

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
            <p className="font-mono text-gray-600">v{latestPatchSet.version}</p>
            <p className="text-gray-500">
              {latestPatchSet.patches?.length || 0} patches - {latestPatchSet.status}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No patch sets yet</p>
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

function PatchSetsTab({ patchSets }: { patchSets: PatchSet[] }) {
  const [expandedPatchSet, setExpandedPatchSet] = useState<string | null>(null);

  if (patchSets.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        No patch sets proposed
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {patchSets.map(patchSet => {
        const isExpanded = expandedPatchSet === patchSet.id;
        return (
          <div key={patchSet.id} className="bg-white rounded-lg border border-gray-200">
            <button
              onClick={() => setExpandedPatchSet(isExpanded ? null : patchSet.id)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">v{patchSet.version}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      patchSet.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : patchSet.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {patchSet.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {patchSet.patches?.length || 0} patches • Base: {patchSet.baseSha?.substring(0, 7) || '-'}
                  </p>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400" />
              )}
            </button>
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
                            {patch.filePath}
                          </Link>
                          {patch.title && (
                            <p className="text-sm text-gray-600 mt-1">{patch.title}</p>
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
  );
}

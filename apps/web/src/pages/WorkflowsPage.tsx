import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, AlertCircle, Inbox } from 'lucide-react';
import { useWorkflows } from '../hooks/use-workflows';
import { WorkflowStatusBadge } from '../components/workflow';
import { Modal, Toast, useToast } from '../components/ui';
import { api } from '../api/client';

export function WorkflowsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { workflows, isLoading, error, nextCursor, refetch, loadMore } = useWorkflows({
    status: statusFilter || undefined,
  });
  const { toast, showToast, hideToast } = useToast();

  // Client-side filter by ID substring
  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return workflows;
    const query = searchQuery.toLowerCase();
    return workflows.filter(w => w.id.toLowerCase().includes(query));
  }, [workflows, searchQuery]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const shortenSha = (sha: string | null) => {
    if (!sha) return '-';
    return sha.substring(0, 7);
  };

  const handleCreateWorkflow = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const title = createTitle.trim();
      await api.workflows.create(title || undefined);
      showToast('Workflow created', 'success');
      setShowCreateModal(false);
      setCreateTitle('');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workflow';
      showToast(message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            New Workflow
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-md text-sm"
            >
              <option value="">All</option>
              <option value="INGESTED">Ingested</option>
              <option value="PATCHES_PROPOSED">Patches Proposed</option>
              <option value="WAITING_USER_APPROVAL">Awaiting Approval</option>
              <option value="PR_OPEN">PR Open</option>
              <option value="DONE">Done</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ID..."
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
            />
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Failed to load workflows</h3>
            <p className="text-sm text-red-700 mt-1">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-red-600 underline mt-2 hover:text-red-800"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!error && !isLoading && filteredWorkflows.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No workflows found</h3>
          <p className="text-sm text-gray-500">
            {searchQuery
              ? 'No workflows match your search query.'
              : statusFilter
              ? 'No workflows with the selected status.'
              : 'Create a workflow to get started.'}
          </p>
        </div>
      )}

      {/* Workflows table */}
      {!error && filteredWorkflows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Base SHA
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredWorkflows.map(workflow => (
                <tr key={workflow.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/workflows/${workflow.id}`}
                      className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {workflow.id.substring(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <WorkflowStatusBadge state={workflow.state} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(workflow.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                    {shortenSha(workflow.baseSha ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Load more */}
          {nextCursor && (
            <div className="px-6 py-4 border-t border-gray-200 text-center">
              <button
                onClick={() => loadMore()}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading state (initial) */}
      {isLoading && workflows.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <RefreshCw className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-sm text-gray-500">Loading workflows...</p>
        </div>
      )}

      {/* Create Workflow Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          if (!isCreating) {
            setShowCreateModal(false);
          }
        }}
        title="Create Workflow"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              value={createTitle}
              onChange={e => setCreateTitle(e.target.value)}
              placeholder="E.g., Update README"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
              disabled={isCreating}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowCreateModal(false)}
              disabled={isCreating}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateWorkflow}
              disabled={isCreating}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

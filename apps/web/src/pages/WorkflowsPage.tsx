import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, AlertCircle, Inbox, Plus, X, GitBranch, Star } from 'lucide-react';
import { useWorkflows } from '../hooks/use-workflows';
import { WorkflowStatusBadge } from '../components/workflow';
import { Modal, Toast, useToast } from '../components/ui';
import { api } from '../api/client';
import type { GitHubRepo } from '../types';

interface RepoEntry {
  owner: string;
  repo: string;
  baseBranch: string;
  role: 'primary' | 'secondary';
}

// Get stored repo filter from localStorage
function getStoredRepoFilter(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('repoFilter') || '';
}

function setStoredRepoFilter(filter: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('repoFilter', filter);
}

export function WorkflowsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [repoFilter, setRepoFilter] = useState(getStoredRepoFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  // New fields
  const [createGoal, setCreateGoal] = useState('');
  const [createContext, setCreateContext] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createRepos, setCreateRepos] = useState<RepoEntry[]>([
    { owner: 'puneetrinity', repo: 'arch-orchestrator-sandbox', baseBranch: 'main', role: 'primary' }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  // Parse repo filter for API params
  const [repoOwner, repoName] = repoFilter ? repoFilter.split('/') : [undefined, undefined];

  const { workflows, isLoading, error, nextCursor, refetch, loadMore } = useWorkflows({
    status: statusFilter || undefined,
    repoOwner,
    repoName,
  });
  const { toast, showToast, hideToast } = useToast();

  // Update stored filter when changed
  const handleRepoFilterChange = (value: string) => {
    setRepoFilter(value);
    setStoredRepoFilter(value);
  };

  // Collect unique repos from workflows for filter dropdown
  const uniqueRepos = useMemo(() => {
    const repos = new Set<string>();
    workflows.forEach(w => {
      if (w.repos) {
        w.repos.forEach(r => repos.add(`${r.owner}/${r.repo}`));
      } else if (w.repoOwner && w.repoName) {
        repos.add(`${w.repoOwner}/${w.repoName}`);
      }
    });
    return Array.from(repos).sort();
  }, [workflows]);

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

  useEffect(() => {
    if (!showCreateModal || reposLoading || availableRepos.length > 0) return;
    setReposLoading(true);
    setReposError(null);
    const token = localStorage.getItem('auth_token');
    console.log('[DEBUG] Loading repos, auth_token present:', !!token, token ? `(${token.substring(0, 20)}...)` : '');
    api.github
      .listRepos({ per_page: 100 })
      .then(repos => {
        console.log('[DEBUG] Loaded repos:', repos.length);
        setAvailableRepos(repos);
      })
      .catch(err => {
        console.error('[DEBUG] Failed to load repos:', err);
        const message = err instanceof Error ? err.message : 'Failed to load repositories';
        setReposError(message);
      })
      .finally(() => setReposLoading(false));
  }, [showCreateModal, reposLoading, availableRepos.length]);

  const addRepo = () => {
    setCreateRepos([
      ...createRepos,
      { owner: '', repo: '', baseBranch: 'main', role: 'secondary' }
    ]);
  };

  const removeRepo = (index: number) => {
    if (createRepos.length <= 1) return;
    const newRepos = createRepos.filter((_, i) => i !== index);
    // Ensure at least one primary
    if (!newRepos.some(r => r.role === 'primary') && newRepos.length > 0) {
      newRepos[0].role = 'primary';
    }
    setCreateRepos(newRepos);
  };

  const updateRepo = (index: number, field: keyof RepoEntry, value: string) => {
    setCreateRepos(prev => {
      const newRepos = [...prev];
      if (field === 'role') {
        // If setting this repo as primary, remove primary from others
        if (value === 'primary') {
          newRepos.forEach((r, i) => {
            r.role = i === index ? 'primary' : 'secondary';
          });
        } else {
          newRepos[index].role = value as 'primary' | 'secondary';
        }
      } else if (field === 'owner') {
        newRepos[index].owner = value;
      } else if (field === 'repo') {
        newRepos[index].repo = value;
      } else if (field === 'baseBranch') {
        newRepos[index].baseBranch = value;
      }
      return newRepos;
    });
  };

  const applyRepoSelection = (index: number, repoOption: GitHubRepo) => {
    setCreateRepos(prev => {
      const newRepos = [...prev];
      newRepos[index] = {
        ...newRepos[index],
        owner: repoOption.owner,
        repo: repoOption.name,
        baseBranch: repoOption.defaultBranch,
      };
      return newRepos;
    });
  };

  const handleCreateWorkflow = async () => {
    if (isCreating) return;

    const goal = createGoal.trim();
    if (!goal) {
      showToast('Goal is required', 'error');
      return;
    }

    // Validate repos
    const validRepos = createRepos.filter(r => r.owner.trim() && r.repo.trim());
    if (validRepos.length === 0) {
      showToast('At least one repository is required', 'error');
      return;
    }

    // Ensure exactly one primary
    const primaryCount = validRepos.filter(r => r.role === 'primary').length;
    if (primaryCount === 0) {
      validRepos[0].role = 'primary';
    } else if (primaryCount > 1) {
      showToast('Only one repository can be primary', 'error');
      return;
    }

    setIsCreating(true);
    try {
      await api.workflows.create({
        goal,
        context: createContext.trim() || undefined,
        title: createTitle.trim() || undefined,
        repos: validRepos.map(r => ({
          owner: r.owner.trim(),
          repo: r.repo.trim(),
          baseBranch: r.baseBranch.trim() || 'main',
          role: r.role
        }))
      });
      showToast('Workflow created', 'success');
      setShowCreateModal(false);
      // Reset form
      setCreateGoal('');
      setCreateContext('');
      setCreateTitle('');
      setCreateRepos([{ owner: 'puneetrinity', repo: 'arch-orchestrator-sandbox', baseBranch: 'main', role: 'primary' }]);
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
              Repository
            </label>
            <select
              value={repoFilter}
              onChange={e => handleRepoFilterChange(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-md text-sm min-w-[200px]"
            >
              <option value="">All Repositories</option>
              {uniqueRepos.map(repo => (
                <option key={repo} value={repo}>{repo}</option>
              ))}
            </select>
          </div>
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
                  Repositories
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
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
                    {workflow.title && (
                      <p className="text-xs text-gray-500 truncate max-w-[200px]">{workflow.title}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {workflow.repos && workflow.repos.length > 0 ? (
                        workflow.repos.map(repo => (
                          <span
                            key={repo.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono ${
                              repo.role === 'primary'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {repo.role === 'primary' && <Star className="h-3 w-3" />}
                            <GitBranch className="h-3 w-3" />
                            {repo.owner}/{repo.repo}
                          </span>
                        ))
                      ) : workflow.repoOwner && workflow.repoName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-blue-100 text-blue-700">
                          <Star className="h-3 w-3" />
                          <GitBranch className="h-3 w-3" />
                          {workflow.repoOwner}/{workflow.repoName}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <WorkflowStatusBadge state={workflow.state} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(workflow.createdAt)}
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
          {/* Goal - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Goal *
            </label>
            <textarea
              value={createGoal}
              onChange={e => setCreateGoal(e.target.value)}
              placeholder="Describe what you want to accomplish in plain English. E.g., 'Add a login button to the header that redirects to /auth'"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[80px] resize-y"
              disabled={isCreating}
            />
            <p className="text-xs text-gray-500 mt-1">Plain English description of what the AI should implement</p>
          </div>

          {/* Context - Optional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Context (optional)
            </label>
            <textarea
              value={createContext}
              onChange={e => setCreateContext(e.target.value)}
              placeholder="Add extra context: links to issues, acceptance criteria, constraints, etc."
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[60px] resize-y"
              disabled={isCreating}
            />
          </div>

          {/* Title - Optional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              value={createTitle}
              onChange={e => setCreateTitle(e.target.value)}
              placeholder="Short title (auto-generated from goal if empty)"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
              disabled={isCreating}
            />
          </div>

          {/* Repositories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Repositories *
              </label>
              <button
                type="button"
                onClick={addRepo}
                disabled={isCreating}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                Add Repository
              </button>
            </div>
            <div className="space-y-3">
              {createRepos.map((repo, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      Repository {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={repo.role}
                        onChange={e => updateRepo(index, 'role', e.target.value)}
                        disabled={isCreating}
                        className="text-xs px-2 py-1 border border-gray-200 rounded bg-white"
                      >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                      </select>
                      {createRepos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRepo(index)}
                          disabled={isCreating}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3">
                      <select
                        value=""
                        onChange={e => {
                          const value = e.target.value;
                          if (!value) return;
                          const selected = availableRepos.find(r => r.fullName === value);
                          if (!selected) return;
                          applyRepoSelection(index, selected);
                        }}
                        disabled={isCreating || availableRepos.length === 0}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white disabled:opacity-50"
                      >
                        <option value="">
                          {reposLoading
                            ? 'Loading repositories...'
                            : availableRepos.length === 0
                            ? 'No GitHub repositories available'
                            : 'Pick from GitHub (optional)'}
                        </option>
                        {availableRepos.map(repoOption => (
                          <option key={repoOption.id} value={repoOption.fullName}>
                            {repoOption.fullName}
                            {repoOption.private ? ' (private)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={repo.owner}
                      onChange={e => updateRepo(index, 'owner', e.target.value)}
                      placeholder="Owner"
                      className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                      disabled={isCreating}
                    />
                    <input
                      type="text"
                      value={repo.repo}
                      onChange={e => updateRepo(index, 'repo', e.target.value)}
                      placeholder="Repository"
                      className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                      disabled={isCreating}
                    />
                    <input
                      type="text"
                      value={repo.baseBranch}
                      onChange={e => updateRepo(index, 'baseBranch', e.target.value)}
                      placeholder="Branch"
                      className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                      disabled={isCreating}
                    />
                  </div>
                </div>
              ))}
            </div>
            {reposError && (
              <p className="text-xs text-red-600 mt-1">{reposError}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">One repository must be marked as primary</p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
            <button
              onClick={() => setShowCreateModal(false)}
              disabled={isCreating}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateWorkflow}
              disabled={isCreating || !createGoal.trim()}
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

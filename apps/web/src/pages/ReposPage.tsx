import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  FileText,
  FolderGit2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { Modal, Toast, useToast } from '../components/ui';
import type { GitHubRepo } from '../types';

interface RepoContext {
  id: string;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  baseSha: string | null;
  contextPath: string;
  summary: string | null;
  isStale: boolean;
  updatedAt: string;
}

interface RepoRow extends RepoContext {
  status: 'fresh' | 'stale';
}

export function ReposPage() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [contexts, setContexts] = useState<RepoContext[]>([]);
  const [workflowCounts, setWorkflowCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add repo modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [repoBranch, setRepoBranch] = useState('main');
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  // Create feature request modal
  const [showFeatureModal, setShowFeatureModal] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoContext | null>(null);
  const [featureGoal, setFeatureGoal] = useState('');
  const [businessJustification, setBusinessJustification] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // View context modal
  const [showContextModal, setShowContextModal] = useState(false);
  const [contextContent, setContextContent] = useState<string | null>(null);
  const [contextPath, setContextPath] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const loadWorkflowCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    let cursor: string | undefined;
    let pages = 0;

    while (pages < 3) {
      const res = await api.workflows.list({ limit: 200, cursor });
      res.items.forEach(wf => {
        const repos = wf.repos && wf.repos.length > 0
          ? wf.repos.map(r => `${r.owner}/${r.repo}`)
          : wf.repoOwner && wf.repoName
          ? [`${wf.repoOwner}/${wf.repoName}`]
          : [];
        repos.forEach(repoKey => {
          counts[repoKey] = (counts[repoKey] || 0) + 1;
        });
      });
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
      pages += 1;
    }

    return counts;
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [contextsRes, counts] = await Promise.all([
        api.repos.listContexts(),
        loadWorkflowCounts(),
      ]);
      setContexts(contextsRes);
      setWorkflowCounts(counts);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load repositories';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadWorkflowCounts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!showAddModal || reposLoading || availableRepos.length > 0) return;
    const fetchRepos = async () => {
      setReposLoading(true);
      setReposError(null);
      try {
        const repos = await api.github.listRepos({ per_page: 100, page: 1 });
        setAvailableRepos(repos);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load GitHub repos';
        setReposError(message);
      } finally {
        setReposLoading(false);
      }
    };
    fetchRepos();
  }, [showAddModal, reposLoading, availableRepos.length]);

  const rows: RepoRow[] = useMemo(() => {
    return contexts.map(ctx => ({
      ...ctx,
      status: ctx.isStale ? 'stale' : 'fresh',
    }));
  }, [contexts]);

  const handleRefresh = async (ctx: RepoContext) => {
    const key = `${ctx.repoOwner}/${ctx.repoName}/${ctx.baseBranch}`;
    setRefreshing(prev => ({ ...prev, [key]: true }));
    try {
      await api.repos.refreshContext(ctx.repoOwner, ctx.repoName, ctx.baseBranch);
      showToast('Context refresh started', 'success');
      setTimeout(() => {
        loadData();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh context';
      showToast(message, 'error');
    } finally {
      setRefreshing(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleAddRepo = async () => {
    if (!repoOwner.trim() || !repoName.trim()) {
      showToast('Owner and repository are required', 'error');
      return;
    }
    try {
      await api.repos.refreshContext(repoOwner.trim(), repoName.trim(), repoBranch.trim() || 'main');
      showToast('Repository added and context refresh started', 'success');
      setShowAddModal(false);
      setRepoOwner('');
      setRepoName('');
      setRepoBranch('main');
      setTimeout(() => loadData(), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add repository';
      showToast(message, 'error');
    }
  };

  const openFeatureModal = (ctx: RepoContext) => {
    setSelectedRepo(ctx);
    setShowFeatureModal(true);
  };

  const handleViewContext = async (ctx: RepoContext) => {
    setSelectedRepo(ctx);
    setContextContent(null);
    setContextPath(null);
    setContextLoading(true);
    setShowContextModal(true);

    try {
      const result = await api.repos.getContextContent(ctx.repoOwner, ctx.repoName, ctx.baseBranch);
      setContextContent(result.content);
      setContextPath(result.contextPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load context';
      showToast(message, 'error');
      setShowContextModal(false);
    } finally {
      setContextLoading(false);
    }
  };

  const handleCopyContext = async () => {
    if (!contextContent) return;
    try {
      await navigator.clipboard.writeText(contextContent);
      showToast('Context copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  const handleCreateFeature = async () => {
    if (!selectedRepo) return;
    if (!featureGoal.trim() || !businessJustification.trim()) {
      showToast('Feature goal and business justification are required', 'error');
      return;
    }
    setIsCreating(true);
    try {
      const created = await api.workflows.create({
        featureGoal: featureGoal.trim(),
        businessJustification: businessJustification.trim(),
        goal: featureGoal.trim(),
        context: additionalContext.trim() || undefined,
        title: title.trim() || undefined,
        repos: [
          {
            owner: selectedRepo.repoOwner,
            repo: selectedRepo.repoName,
            baseBranch: selectedRepo.baseBranch,
            role: 'primary',
          },
        ],
      });
      showToast('Feature request created', 'success');
      setShowFeatureModal(false);
      setFeatureGoal('');
      setBusinessJustification('');
      setAdditionalContext('');
      setTitle('');
      navigate(`/workflows/${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create feature request';
      showToast(message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repositories</h1>
          <p className="text-sm text-gray-500">Manage repo context and start feature requests</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Repository
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <RefreshCw className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-sm text-gray-500">Loading repositories...</p>
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <FolderGit2 className="h-8 w-8 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-4">No repositories added yet</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Repository
          </button>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Repository</th>
                <th className="text-left px-4 py-3 font-medium">Context</th>
                <th className="text-left px-4 py-3 font-medium">Last Refresh</th>
                <th className="text-left px-4 py-3 font-medium">Workflows</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map(ctx => {
                const key = `${ctx.repoOwner}/${ctx.repoName}/${ctx.baseBranch}`;
                const isRefreshing = refreshing[key];
                const countKey = `${ctx.repoOwner}/${ctx.repoName}`;
                return (
                  <tr key={ctx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-mono text-gray-900">{ctx.repoOwner}/{ctx.repoName}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <span>Branch:</span>
                        <span className="font-mono">{ctx.baseBranch}</span>
                        {ctx.baseSha && (
                          <span className="font-mono text-gray-400">{ctx.baseSha.substring(0, 7)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {ctx.status === 'fresh' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                            <CheckCircle className="h-3 w-3" />
                            Fresh
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
                            <AlertTriangle className="h-3 w-3" />
                            Stale
                          </span>
                        )}
                        {ctx.contextPath && (
                          <a
                            href={`https://github.com/${ctx.repoOwner}/${ctx.repoName}/blob/${ctx.baseBranch}/${ctx.contextPath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            title={`View ${ctx.contextPath} on GitHub`}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {ctx.contextPath}
                          </a>
                        )}
                      </div>
                      {ctx.summary && (
                        <div className="mt-2 text-xs text-gray-500 line-clamp-2" title={ctx.summary}>
                          {ctx.summary}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(ctx.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {workflowCounts[countKey] || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewContext(ctx)}
                          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800"
                          title="View stored context"
                        >
                          <FileText className="h-3 w-3" />
                          Context
                        </button>
                        <button
                          onClick={() => handleRefresh(ctx)}
                          disabled={isRefreshing}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                          {isRefreshing ? 'Refreshing' : 'Refresh'}
                        </button>
                        <button
                          onClick={() => openFeatureModal(ctx)}
                          className="flex items-center gap-1 text-xs text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-100"
                        >
                          Create Feature
                        </button>
                        <button
                          onClick={() => navigate(`/workflows?repoOwner=${encodeURIComponent(ctx.repoOwner)}&repoName=${encodeURIComponent(ctx.repoName)}`)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          View Workflows
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Repository Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Repository"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select from GitHub</label>
            <select
              value=""
              onChange={e => {
                const value = e.target.value;
                if (!value) return;
                const selected = availableRepos.find(r => r.fullName === value);
                if (!selected) return;
                setRepoOwner(selected.owner);
                setRepoName(selected.name);
                setRepoBranch(selected.defaultBranch || 'main');
              }}
              disabled={reposLoading || availableRepos.length === 0}
              className="w-full px-2 py-2 border border-gray-200 rounded text-sm bg-white"
            >
              <option value="">
                {reposLoading
                  ? 'Loading repositories...'
                  : availableRepos.length === 0
                  ? 'No GitHub repositories available'
                  : 'Pick a repository'}
              </option>
              {availableRepos.map(repo => (
                <option key={repo.id} value={repo.fullName}>
                  {repo.fullName}{repo.private ? ' (private)' : ''}
                </option>
              ))}
            </select>
            {reposError && <p className="text-xs text-red-600 mt-1">{reposError}</p>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={repoOwner}
              onChange={e => setRepoOwner(e.target.value)}
              placeholder="Owner"
              className="px-2 py-2 border border-gray-200 rounded text-sm"
            />
            <input
              type="text"
              value={repoName}
              onChange={e => setRepoName(e.target.value)}
              placeholder="Repository"
              className="px-2 py-2 border border-gray-200 rounded text-sm"
            />
            <input
              type="text"
              value={repoBranch}
              onChange={e => setRepoBranch(e.target.value)}
              placeholder="Branch"
              className="px-2 py-2 border border-gray-200 rounded text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
            <button
              onClick={() => setShowAddModal(false)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddRepo}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add & Refresh
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Feature Request Modal */}
      <Modal
        isOpen={showFeatureModal}
        onClose={() => setShowFeatureModal(false)}
        title="Create Feature Request"
      >
        <div className="space-y-4">
          {selectedRepo && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm">
              <div className="font-mono text-gray-900">{selectedRepo.repoOwner}/{selectedRepo.repoName}</div>
              <div className="text-xs text-gray-500">Branch: {selectedRepo.baseBranch}</div>
              <div className="mt-1 text-xs text-gray-500">
                Context: {selectedRepo.isStale ? 'Stale' : 'Fresh'}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Feature Goal *</label>
            <textarea
              value={featureGoal}
              onChange={e => setFeatureGoal(e.target.value)}
              placeholder="What do you want to build?"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[80px] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Justification *</label>
            <textarea
              value={businessJustification}
              onChange={e => setBusinessJustification(e.target.value)}
              placeholder="Why does this matter?"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[60px] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Context (optional)</label>
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              placeholder="Constraints, links, acceptance criteria..."
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm min-h-[60px] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Short title"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
            <button
              onClick={() => setShowFeatureModal(false)}
              className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFeature}
              disabled={isCreating}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* View Context Modal */}
      {showContextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Repository Context</h3>
                {selectedRepo && (
                  <div className="text-sm text-gray-500 font-mono">
                    {selectedRepo.repoOwner}/{selectedRepo.repoName}
                    {contextPath && (
                      <span className="ml-2 text-purple-600">({contextPath})</span>
                    )}
                    <span className="ml-3 text-xs text-gray-400 font-sans">
                      Last refreshed: {new Date(selectedRepo.updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowContextModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Stale/missing warning banner */}
            {selectedRepo && !contextLoading && (selectedRepo.isStale || !contextContent) && (
              <div className={`flex items-center gap-2 px-4 py-2 text-sm ${
                !contextContent
                  ? 'bg-red-50 text-red-700 border-b border-red-100'
                  : 'bg-yellow-50 text-yellow-700 border-b border-yellow-100'
              }`}>
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {!contextContent
                  ? 'No context available. Click "Refresh Context" to generate one.'
                  : 'Context is stale and may be outdated. Consider refreshing.'
                }
              </div>
            )}

            <div className="flex-1 overflow-auto p-4">
              {contextLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Loading context...</span>
                </div>
              ) : contextContent ? (
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono bg-gray-50 rounded-lg p-4 overflow-x-auto">
                  {contextContent}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No context content available</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Click Refresh to generate context for this repository
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div>
                {contextContent && (
                  <button
                    onClick={handleCopyContext}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md"
                  >
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedRepo && (
                  <button
                    onClick={() => {
                      setShowContextModal(false);
                      handleRefresh(selectedRepo);
                    }}
                    className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <RefreshCw className="h-4 w-4 inline mr-1" />
                    Refresh Context
                  </button>
                )}
                <button
                  onClick={() => setShowContextModal(false)}
                  className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

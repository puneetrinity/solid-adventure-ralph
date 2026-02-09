import type { Workflow, PatchSet, Patch, PaginatedResponse, ApiError } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const AUTH_TOKEN_KEY = 'auth_token';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

class ApiClientError extends Error {
  errorCode: string;
  status?: number;

  constructor(errorCode: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.errorCode = errorCode;
    this.status = status;
  }
}

async function fetchJson<T>(
  path: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const token = getAuthToken();
    const hasAuthHeader =
      options.headers instanceof Headers
        ? options.headers.has('Authorization')
        : !!(options.headers && Object.prototype.hasOwnProperty.call(options.headers, 'Authorization'));
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token && !hasAuthHeader ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      credentials: 'include',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: ApiError;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          errorCode: 'UNKNOWN_ERROR',
          message: `Request failed with status ${response.status}`,
        };
      }
      throw new ApiClientError(errorData.errorCode, errorData.message, response.status);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiClientError('TIMEOUT', 'Request timed out');
      }
      throw new ApiClientError('NETWORK_ERROR', error.message);
    }

    throw new ApiClientError('UNKNOWN_ERROR', 'An unknown error occurred');
  }
}

interface WorkflowListParams {
  limit?: number;
  cursor?: string;
  status?: string;
  repoOwner?: string;
  repoName?: string;
  [key: string]: string | number | undefined;
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return filtered.length ? `?${filtered.join('&')}` : '';
}

export const api = {
  health: () => fetchJson<{ status: string }>('/api/health'),

  workflows: {
    list: (params?: WorkflowListParams) =>
      fetchJson<PaginatedResponse<Workflow>>(`/api/workflows${qs(params)}`),

    create: (params: {
      featureGoal?: string;
      businessJustification?: string;
      goal?: string;  // Legacy
      context?: string;
      title?: string;
      repos?: Array<{ owner: string; repo: string; baseBranch?: string; role?: string }>;
      // Legacy fields (deprecated)
      repoOwner?: string;
      repoName?: string;
      baseBranch?: string;
    }) =>
      fetchJson<{ id: string; state: string; stage?: string; stageStatus?: string; featureGoal?: string; businessJustification?: string; goal?: string; context?: string; repos?: Array<{ owner: string; repo: string; baseBranch: string; role: string }> }>(`/api/workflows`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    get: (id: string) => fetchJson<Workflow>(`/api/workflows/${id}`),

    approve: (id: string, patchSetId?: string) =>
      fetchJson<Workflow>(`/api/workflows/${id}/actions/approve`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId }),
      }),

    reject: (id: string, patchSetId: string, reason: string) =>
      fetchJson<Workflow>(`/api/workflows/${id}/actions/reject`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId, reason }),
      }),

    requestChanges: (id: string, patchSetId: string, comment: string) =>
      fetchJson<Workflow>(`/api/workflows/${id}/actions/request_changes`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId, comment }),
      }),

    cancel: (id: string) =>
      fetchJson<{ ok: boolean; workflowId: string }>(`/api/workflows/${id}/actions/cancel`, {
        method: 'POST',
      }),

    delete: (id: string) =>
      fetchJson<{ ok: boolean; workflowId: string }>(`/api/workflows/${id}`, {
        method: 'DELETE',
      }),

    // Stage actions (gated pipeline)
    approveStage: (id: string, stage: string, reason?: string) =>
      fetchJson<{ ok: boolean; workflowId: string; stage: string; newStatus: string; decisionId?: string; error?: string }>(
        `/api/workflows/${id}/stages/${stage}/approve`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      ),

    rejectStage: (id: string, stage: string, reason?: string) =>
      fetchJson<{ ok: boolean; workflowId: string; stage: string; newStatus: string; decisionId?: string; error?: string }>(
        `/api/workflows/${id}/stages/${stage}/reject`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      ),

    requestStageChanges: (id: string, stage: string, reason: string) =>
      fetchJson<{ ok: boolean; workflowId: string; stage: string; newStatus: string; decisionId?: string; error?: string }>(
        `/api/workflows/${id}/stages/${stage}/request_changes`,
        { method: 'POST', body: JSON.stringify({ reason }) }
      ),

    getPatchSets: (id: string) =>
      fetchJson<PatchSet[]>(`/api/workflows/${id}/patch_sets`),

    getEvents: (id: string) =>
      fetchJson<{ id: string; type: string; payload: unknown; createdAt: string }[]>(
        `/api/workflows/${id}/events`
      ),
  },

  patches: {
    get: (id: string) => fetchJson<Patch>(`/api/patches/${id}`),
  },

  auth: {
    me: () =>
      fetchJson<{
        id: string;
        username: string;
        name: string | null;
        avatarUrl: string;
      }>('/api/auth/me'),

    callback: (code: string) =>
      fetchJson<{
        ok: boolean;
        token?: string;
        user: {
          id: string;
          username: string;
          name: string | null;
          avatarUrl: string;
        };
      }>(`/api/auth/github/callback?code=${encodeURIComponent(code)}`, {
        method: 'POST',
      }),

    logout: () =>
      fetchJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

    getLoginUrl: () => `${API_BASE}/api/auth/github`,
  },

  github: {
    listRepos: (params?: { page?: number; per_page?: number }) =>
      fetchJson<Array<{
        id: number;
        name: string;
        fullName: string;
        private: boolean;
        owner: string;
        defaultBranch: string;
        permissions: { admin?: boolean; push?: boolean; pull?: boolean };
      }>>(`/api/auth/github/repos${qs(params)}`),
  },

  repos: {
    getContext: (owner: string, repo: string, branch?: string) =>
      fetchJson<{
        status: 'fresh' | 'stale' | 'missing';
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
      }>(`/api/repos/context${qs({ owner, repo, branch })}`),

    refreshContext: (owner: string, repo: string, branch?: string, workflowId?: string) =>
      fetchJson<{ ok: boolean; jobId: string; message: string }>(
        `/api/repos/context/refresh${qs({ owner, repo, branch, workflowId })}`,
        { method: 'POST' }
      ),

    listContexts: (owner?: string) =>
      fetchJson<Array<{
        id: string;
        repoOwner: string;
        repoName: string;
        baseBranch: string;
        baseSha: string | null;
        contextPath: string;
        summary: string | null;
        isStale: boolean;
        updatedAt: string;
      }>>(`/api/repos/contexts${qs({ owner })}`),
  },
};

export { ApiClientError, fetchJson };

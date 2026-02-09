import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Workflow } from '../types';

interface UseWorkflowsResult {
  workflows: Workflow[];
  isLoading: boolean;
  error: Error | null;
  nextCursor: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

interface UseWorkflowsOptions {
  limit?: number;
  status?: string;
  repoOwner?: string;
  repoName?: string;
}

export function useWorkflows(options: UseWorkflowsOptions = {}): UseWorkflowsResult {
  const { limit = 20, status, repoOwner, repoName } = options;
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async (cursor?: string, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.workflows.list({ limit, cursor, status, repoOwner, repoName });

      if (append) {
        setWorkflows(prev => [...prev, ...result.items]);
      } else {
        setWorkflows(result.items);
      }
      setNextCursor(result.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch workflows'));
    } finally {
      setIsLoading(false);
    }
  }, [limit, status, repoOwner, repoName]);

  const refetch = useCallback(async () => {
    await fetchWorkflows();
  }, [fetchWorkflows]);

  const loadMore = useCallback(async () => {
    if (nextCursor) {
      await fetchWorkflows(nextCursor, true);
    }
  }, [fetchWorkflows, nextCursor]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  return { workflows, isLoading, error, nextCursor, refetch, loadMore };
}

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Patch } from '../types';

interface UsePatchResult {
  patch: Patch | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function usePatch(patchId: string): UsePatchResult {
  const [patch, setPatch] = useState<Patch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPatch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.patches.get(patchId);
      setPatch(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch patch'));
    } finally {
      setIsLoading(false);
    }
  }, [patchId]);

  const refetch = useCallback(async () => {
    await fetchPatch();
  }, [fetchPatch]);

  useEffect(() => {
    fetchPatch();
  }, [fetchPatch]);

  return { patch, isLoading, error, refetch };
}

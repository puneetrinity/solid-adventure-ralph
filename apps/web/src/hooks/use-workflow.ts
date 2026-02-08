import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { Workflow } from '../types';

const POLL_INTERVAL = 4000; // 4 seconds
const TERMINAL_STATES = ['DONE', 'FAILED', 'NEEDS_HUMAN', 'BLOCKED_POLICY'];

interface UseWorkflowResult {
  workflow: Workflow | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isPolling: boolean;
  lastUpdated: Date | null;
}

interface UseWorkflowOptions {
  enablePolling?: boolean;
}

export function useWorkflow(workflowId: string, options: UseWorkflowOptions = {}): UseWorkflowResult {
  const { enablePolling = true } = options;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);

  const isTerminalState = workflow ? TERMINAL_STATES.includes(workflow.state) : false;

  const fetchWorkflow = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const result = await api.workflows.get(workflowId);
      setWorkflow(result);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch workflow'));
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  const refetch = useCallback(async () => {
    await fetchWorkflow(false);
  }, [fetchWorkflow]);

  // Initial fetch
  useEffect(() => {
    fetchWorkflow(false);
  }, [fetchWorkflow]);

  // Polling logic
  useEffect(() => {
    if (!enablePolling || isTerminalState || error) {
      setIsPolling(false);
      return;
    }

    if (workflow) {
      setIsPolling(true);

      const poll = () => {
        pollTimeoutRef.current = window.setTimeout(async () => {
          await fetchWorkflow(true); // Silent fetch
          poll(); // Schedule next poll
        }, POLL_INTERVAL);
      };

      poll();

      return () => {
        if (pollTimeoutRef.current) {
          clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
        setIsPolling(false);
      };
    }
  }, [enablePolling, isTerminalState, error, workflow?.state, fetchWorkflow]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  return { workflow, isLoading, error, refetch, isPolling, lastUpdated };
}

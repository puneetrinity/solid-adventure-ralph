import { useState, useEffect } from 'react';
import { Coins, Zap, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface CostData {
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    estimatedCostUsd: string;
    totalDurationMs: number;
    runCount: number;
    successCount: number;
    failedCount: number;
  };
  byJob: Array<{
    name: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    estimatedCostUsd: string;
    count: number;
    durationMs: number;
  }>;
  byRole: Array<{
    name: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    estimatedCostUsd: string;
    count: number;
    durationMs: number;
  }>;
}

interface CostSummaryProps {
  workflowId: string;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(1)}m`;
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

export function CostSummary({ workflowId }: CostSummaryProps) {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchCosts() {
      try {
        const response = await fetch(`/api/workflows/${workflowId}/costs`);
        if (!response.ok) {
          throw new Error('Failed to fetch costs');
        }
        const costData = await response.json();
        setData(costData);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchCosts();
  }, [workflowId]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="h-4 bg-gray-700 rounded w-24"></div>
          <div className="h-4 bg-gray-700 rounded w-16"></div>
          <div className="h-4 bg-gray-700 rounded w-20"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 text-red-400 text-sm">
        {error || 'No cost data available'}
      </div>
    );
  }

  const { totals, byJob, byRole } = data;

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Summary header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium text-gray-200">
              ${totals.estimatedCostUsd}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-gray-400">
              {formatNumber(totals.totalTokens)} tokens
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-gray-400">
              {formatDuration(totals.totalDurationMs)}
            </span>
          </div>

          <div className="flex items-center gap-3 ml-4">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-xs text-gray-400">{totals.successCount}</span>
            </div>
            {totals.failedCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="text-xs text-gray-400">{totals.failedCount}</span>
              </div>
            )}
          </div>
        </div>

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* Token breakdown */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-900/50 rounded p-3">
              <div className="text-gray-400 mb-1">Input Tokens</div>
              <div className="text-lg font-medium text-gray-200">
                {formatNumber(totals.inputTokens)}
              </div>
            </div>
            <div className="bg-gray-900/50 rounded p-3">
              <div className="text-gray-400 mb-1">Output Tokens</div>
              <div className="text-lg font-medium text-gray-200">
                {formatNumber(totals.outputTokens)}
              </div>
            </div>
          </div>

          {/* By Job breakdown */}
          {byJob.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-2">By Job</h4>
              <div className="space-y-1">
                {byJob.map((job) => (
                  <div
                    key={job.name}
                    className="flex items-center justify-between bg-gray-900/50 rounded px-3 py-2 text-xs"
                  >
                    <span className="text-gray-300">{job.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-400">
                        {formatNumber(job.totalTokens)} tokens
                      </span>
                      <span className="text-yellow-400 font-medium">
                        ${job.estimatedCostUsd}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By Role breakdown */}
          {byRole.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-2">By Agent Role</h4>
              <div className="flex flex-wrap gap-2">
                {byRole.map((role) => (
                  <div
                    key={role.name}
                    className="bg-gray-900/50 rounded px-3 py-2 text-xs"
                  >
                    <span className="text-gray-300 capitalize">{role.name}</span>
                    <span className="text-gray-500 mx-2">|</span>
                    <span className="text-gray-400">{formatNumber(role.totalTokens)}</span>
                    <span className="text-yellow-400 ml-2">${role.estimatedCostUsd}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

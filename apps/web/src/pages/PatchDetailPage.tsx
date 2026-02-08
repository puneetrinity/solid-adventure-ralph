import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  Code,
  FileText,
  TestTube,
  Terminal,
} from 'lucide-react';
import { usePatch } from '../hooks/use-patch';
import { DiffViewer } from '../components/patch';

export function PatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { patch, isLoading, error, refetch } = usePatch(id!);
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const copyDiff = async () => {
    if (!patch?.diff) return;
    try {
      await navigator.clipboard.writeText(patch.diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
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
            <h3 className="text-sm font-medium text-red-800">Failed to load patch</h3>
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

  if (!patch) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800">Patch not found</p>
        <Link to="/workflows" className="text-sm text-yellow-600 underline mt-2 inline-block">
          Back to workflows
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/workflows"
            className="p-2 rounded-md hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patch</h1>
            <p className="text-sm text-gray-500 font-mono">{patch.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-md ${
              showRawJson
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Code className="h-4 w-4" />
            Raw JSON
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
              <FileText className="h-3 w-3" />
              File Path
            </p>
            <p className="text-sm font-mono truncate" title={patch.filePath}>
              {patch.filePath}
            </p>
          </div>
          {patch.title && (
            <div>
              <p className="text-xs text-gray-500 uppercase">Title</p>
              <p className="text-sm">{patch.title}</p>
            </div>
          )}
          {patch.taskId && (
            <div>
              <p className="text-xs text-gray-500 uppercase">Task ID</p>
              <p className="text-sm font-mono">{patch.taskId}</p>
            </div>
          )}
          {patch.riskLevel && (
            <div>
              <p className="text-xs text-gray-500 uppercase">Risk Level</p>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                patch.riskLevel === 'high'
                  ? 'bg-red-100 text-red-700'
                  : patch.riskLevel === 'medium'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {patch.riskLevel}
              </span>
            </div>
          )}
          {patch.addsTests !== undefined && (
            <div>
              <p className="text-xs text-gray-500 uppercase flex items-center gap-1">
                <TestTube className="h-3 w-3" />
                Adds Tests
              </p>
              <p className="text-sm">{patch.addsTests ? 'Yes' : 'No'}</p>
            </div>
          )}
        </div>

        {/* Proposed commands */}
        {patch.proposedCommands && patch.proposedCommands.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 uppercase flex items-center gap-1 mb-2">
              <Terminal className="h-3 w-3" />
              Proposed Commands
            </p>
            <ul className="space-y-1">
              {patch.proposedCommands.map((cmd, index) => (
                <li key={index} className="font-mono text-sm bg-gray-50 px-2 py-1 rounded">
                  {cmd}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      {showRawJson ? (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Raw JSON</h2>
          </div>
          <div className="p-4">
            <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto">
              {JSON.stringify(patch, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        /* Diff viewer */
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Diff</h2>
            <button
              onClick={copyDiff}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy diff
                </>
              )}
            </button>
          </div>
          <div className="overflow-x-auto">
            {patch.diff ? (
              <DiffViewer diff={patch.diff} filePath={patch.filePath} />
            ) : (
              <div className="p-6 text-center text-gray-500">
                No diff content available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

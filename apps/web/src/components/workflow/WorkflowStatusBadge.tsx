import type { WorkflowState } from '../../types';

interface WorkflowStatusBadgeProps {
  state: WorkflowState | string;
}

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  INGESTED: { color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Ingested' },
  CONTEXT_GATHERED: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Context Gathered' },
  PLANNING: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Planning' },
  PATCHES_PROPOSED: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Patches Proposed' },
  WAITING_USER_APPROVAL: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Awaiting Approval' },
  APPLYING_PATCHES: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Applying...' },
  PR_OPEN: { color: 'text-purple-700', bgColor: 'bg-purple-100', label: 'PR Open' },
  DONE: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'Done' },
  BLOCKED_POLICY: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Blocked' },
  NEEDS_HUMAN: { color: 'text-orange-700', bgColor: 'bg-orange-100', label: 'Needs Input' },
  FAILED: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Failed' },
};

export function WorkflowStatusBadge({ state }: WorkflowStatusBadgeProps) {
  const config = statusConfig[state] || {
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    label: state,
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      {config.label}
    </span>
  );
}

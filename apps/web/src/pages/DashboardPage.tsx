import { Link } from 'react-router-dom';
import { GitBranch, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useWorkflows } from '../hooks/use-workflows';
import { WorkflowStatusBadge } from '../components/workflow';

export function DashboardPage() {
  const { workflows, isLoading, error, refetch } = useWorkflows();

  const stats = {
    total: workflows.length,
    pending: workflows.filter(w => w.state === 'WAITING_USER_APPROVAL').length,
    inProgress: workflows.filter(w =>
      ['INGESTED', 'PATCHES_PROPOSED', 'APPLYING_PATCHES'].includes(w.state)
    ).length,
    completed: workflows.filter(w => w.state === 'DONE' || w.state === 'PR_OPEN').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to load data: {error.message}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={GitBranch}
          label="Total Workflows"
          value={isLoading ? '-' : stats.total}
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="Pending Approval"
          value={isLoading ? '-' : stats.pending}
          color="yellow"
        />
        <StatCard
          icon={AlertCircle}
          label="In Progress"
          value={isLoading ? '-' : stats.inProgress}
          color="purple"
        />
        <StatCard
          icon={CheckCircle}
          label="Completed"
          value={isLoading ? '-' : stats.completed}
          color="green"
        />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/workflows"
            className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
          >
            View All Workflows
          </Link>
        </div>
      </div>

      {/* Recent workflows */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Workflows</h2>
        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : workflows.length === 0 ? (
          <p className="text-gray-500 text-sm">No workflows yet.</p>
        ) : (
          <div className="space-y-3">
            {workflows.slice(0, 5).map(workflow => (
              <Link
                key={workflow.id}
                to={`/workflows/${workflow.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {workflow.title || `${workflow.repoOwner}/${workflow.repoName}`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(workflow.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <WorkflowStatusBadge state={workflow.state} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: 'blue' | 'yellow' | 'purple' | 'green';
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

import { Menu, Activity, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onMenuClick: () => void;
  apiStatus: 'connected' | 'disconnected' | 'checking';
}

export function Header({ onMenuClick, apiStatus }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 sticky top-0 z-10">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-md hover:bg-gray-100 lg:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1 flex items-center">
        <h1 className="text-lg font-semibold text-gray-900 ml-2 lg:ml-0">
          Arch Orchestrator
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm">
          <Activity
            className={`h-4 w-4 ${
              apiStatus === 'connected'
                ? 'text-green-500'
                : apiStatus === 'disconnected'
                ? 'text-red-500'
                : 'text-yellow-500'
            }`}
          />
          <span
            className={`${
              apiStatus === 'connected'
                ? 'text-green-600'
                : apiStatus === 'disconnected'
                ? 'text-red-600'
                : 'text-yellow-600'
            }`}
          >
            {apiStatus === 'connected'
              ? 'Connected'
              : apiStatus === 'disconnected'
              ? 'Disconnected'
              : 'Checking...'}
          </span>
        </div>

        {user && (
          <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
            <div className="flex items-center gap-2">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="h-7 w-7 rounded-full"
                />
              )}
              <span className="text-sm font-medium text-gray-700">
                {user.username}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

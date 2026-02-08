import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Github, RefreshCw } from 'lucide-react';

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/workflows" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-6">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">arch-orchestrator</h1>
            <p className="text-gray-600 mt-2">Sign in to access the dashboard</p>
          </div>

          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
          >
            <Github className="h-5 w-5" />
            Sign in with GitHub
          </button>

          <p className="text-xs text-gray-500 text-center mt-6">
            Only authorized users can access this application.
          </p>
        </div>
      </div>
    </div>
  );
}

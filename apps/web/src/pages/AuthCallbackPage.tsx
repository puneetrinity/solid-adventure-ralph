import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { api, setAuthToken } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(searchParams.get('error_description') || 'Authentication failed');
      return;
    }

    if (!code) {
      setError('No authorization code provided');
      return;
    }

    async function handleCallback() {
      try {
        const result = await api.auth.callback(code!);
        if (result.token) {
          setAuthToken(result.token);
        }
        await checkAuth();
        navigate('/workflows', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    }

    handleCallback();
  }, [searchParams, navigate, checkAuth]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-6">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle className="h-6 w-6" />
              <h1 className="text-lg font-semibold">Authentication Failed</h1>
            </div>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}

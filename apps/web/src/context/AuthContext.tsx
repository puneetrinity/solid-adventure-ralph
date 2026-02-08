import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, ApiClientError, clearAuthToken } from '../api/client';

interface User {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const userData = await api.auth.me();
      setUser(userData);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        clearAuthToken();
        setUser(null);
      } else {
        console.error('Auth check failed:', error);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(() => {
    window.location.href = api.auth.getLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
    clearAuthToken();
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

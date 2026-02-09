import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import {
  DashboardPage,
  ReposPage,
  WorkflowsPage,
  WorkflowDetailPage,
  PatchDetailPage,
  SettingsPage,
} from './pages';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ReposPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="repos" element={<ReposPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="workflows/:id" element={<WorkflowDetailPage />} />
            <Route path="patches/:id" element={<PatchDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

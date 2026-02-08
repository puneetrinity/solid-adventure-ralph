# Frontend Scaffold (Vite + React + TypeScript)

> Complete file contents for `apps/web/`

---

## 1. Project Setup Files

### `apps/web/package.json`
```json
{
  "name": "@arch-orchestrator/web",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "lucide-react": "^0.441.0",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.2"
  }
}
```

### `apps/web/vite.config.ts`
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

### `apps/web/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### `apps/web/tailwind.config.js`
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        status: {
          ingested: '#71717a',
          proposed: '#3b82f6',
          waiting: '#eab308',
          applying: '#3b82f6',
          'pr-open': '#a855f7',
          done: '#22c55e',
          blocked: '#ef4444',
          'needs-human': '#f97316',
          failed: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
```

### `apps/web/postcss.config.js`
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### `apps/web/.env.example`
```
VITE_API_BASE_URL=http://localhost:3000
VITE_GITHUB_CLIENT_ID=your_github_client_id
```

### `apps/web/index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arch Orchestrator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## 2. Entry Point & Routing

### `apps/web/src/main.tsx`
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

### `apps/web/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900;
}

/* Diff viewer styles */
.diff-add {
  @apply bg-green-100 text-green-800;
}
.diff-del {
  @apply bg-red-100 text-red-800;
}
.diff-hunk {
  @apply bg-blue-50 text-blue-600;
}
```

### `apps/web/src/App.tsx`
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { WorkflowDetailPage } from './pages/WorkflowDetailPage';
import { PatchDetailPage } from './pages/PatchDetailPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/patches/:id" element={<PatchDetailPage />} />
      </Routes>
    </Layout>
  );
}
```

---

## 3. API Client

### `apps/web/src/api/client.ts`
```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

async function fetchJson<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...init } = options;

  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
    url += `?${searchParams}`;
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Types
export interface Workflow {
  id: string;
  state: WorkflowState;
  baseSha: string | null;
  createdAt: string;
  updatedAt: string;
  patchSets?: PatchSet[];
  events?: WorkflowEvent[];
  artifacts?: Artifact[];
  policyViolations?: PolicyViolation[];
}

export type WorkflowState =
  | 'INGESTED'
  | 'PATCHES_PROPOSED'
  | 'WAITING_USER_APPROVAL'
  | 'APPLYING_PATCHES'
  | 'PR_OPEN'
  | 'DONE'
  | 'BLOCKED_POLICY'
  | 'NEEDS_HUMAN'
  | 'FAILED';

export interface PatchSet {
  id: string;
  workflowId: string;
  title: string;
  baseSha: string;
  status: 'proposed' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  patches: Patch[];
}

export interface Patch {
  id: string;
  patchSetId: string;
  taskId: string | null;
  title: string;
  summary: string;
  diff: string;
  files: { path: string; additions: number; deletions: number }[];
  addsTests: boolean;
  riskLevel: 'low' | 'med' | 'high';
  proposedCommands: string[];
  createdAt: string;
}

export interface WorkflowEvent {
  id: string;
  workflowId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Artifact {
  id: string;
  workflowId: string;
  kind: string;
  path: string | null;
  content: string;
  contentSha: string;
  createdAt: string;
}

export interface PolicyViolation {
  id: string;
  workflowId: string;
  patchSetId: string | null;
  rule: string;
  severity: 'WARN' | 'BLOCK';
  file: string;
  message: string;
  line: number | null;
  evidence: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

// API methods
export const api = {
  health: () => fetchJson<{ status: string }>('/api/health'),

  workflows: {
    list: (params?: { limit?: number; cursor?: string; status?: WorkflowState }) =>
      fetchJson<PaginatedResponse<Workflow>>('/api/workflows', { params }),

    get: (id: string) => fetchJson<Workflow>(`/api/workflows/${id}`),

    approve: (id: string, patchSetId?: string) =>
      fetchJson<Workflow>(`/api/workflows/${id}/actions/approve`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId }),
      }),

    reject: (id: string, patchSetId: string, reason: string) =>
      fetchJson<Workflow>(`/api/workflows/${id}/actions/reject_patch_set`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId, reason }),
      }),

    requestChanges: (id: string, patchSetId: string, comment: string) =>
      fetchJson<Workflow>(`/api/workflows/${id}/actions/request_changes`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId, comment }),
      }),
  },

  patches: {
    get: (id: string) => fetchJson<Patch>(`/api/patches/${id}`),
  },
};
```

---

## 4. Hooks

### `apps/web/src/hooks/useWorkflows.ts`
```ts
import { useState, useEffect, useCallback } from 'react';
import { api, Workflow, WorkflowState, PaginatedResponse } from '@/api/client';

interface UseWorkflowsParams {
  limit?: number;
  status?: WorkflowState;
}

export function useWorkflows(params: UseWorkflowsParams = {}) {
  const [data, setData] = useState<PaginatedResponse<Workflow> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.workflows.list(params);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [params.limit, params.status]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
```

### `apps/web/src/hooks/useWorkflow.ts`
```ts
import { useState, useEffect, useCallback } from 'react';
import { api, Workflow } from '@/api/client';

const POLL_INTERVAL = 3000;
const TERMINAL_STATES = ['DONE', 'FAILED', 'NEEDS_HUMAN', 'BLOCKED_POLICY'];

export function useWorkflow(id: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await api.workflows.get(id);
      setWorkflow(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();

    const interval = setInterval(() => {
      if (workflow && TERMINAL_STATES.includes(workflow.state)) return;
      fetch();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [fetch, workflow?.state]);

  return { workflow, isLoading, error, refetch: fetch };
}
```

### `apps/web/src/hooks/usePatch.ts`
```ts
import { useState, useEffect } from 'react';
import { api, Patch } from '@/api/client';

export function usePatch(id: string) {
  const [patch, setPatch] = useState<Patch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    api.patches
      .get(id)
      .then(setPatch)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [id]);

  return { patch, isLoading, error };
}
```

---

## 5. Types

### `apps/web/src/types/index.ts`
```ts
export * from '@/api/client';
```

---

## 6. Layout Components

### `apps/web/src/components/layout/Layout.tsx`
```tsx
import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, GitBranch, Settings, RefreshCw } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { path: '/workflows', label: 'Workflows', icon: GitBranch },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold">
            <LayoutDashboard className="w-6 h-6" />
            Orchestrator
          </Link>
        </div>
        <nav className="flex-1 p-4">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1 ${
                location.pathname.startsWith(path)
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 text-sm text-gray-500">
          v0.0.1
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
```

### `apps/web/src/components/layout/PageHeader.tsx`
```tsx
import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
```

---

## 7. Common UI Components

### `apps/web/src/components/ui/Badge.tsx`
```tsx
import { clsx } from 'clsx';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
}

const variantStyles = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={clsx('px-2 py-1 rounded-full text-xs font-medium', variantStyles[variant])}>
      {children}
    </span>
  );
}
```

### `apps/web/src/components/ui/Button.tsx`
```tsx
import { clsx } from 'clsx';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const variantStyles = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-gray-600 hover:bg-gray-100 disabled:text-gray-300',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
```

### `apps/web/src/components/ui/Modal.tsx`
```tsx
import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

### `apps/web/src/components/ui/Card.tsx`
```tsx
import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  className?: string;
  children: ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={clsx('bg-white rounded-lg border border-gray-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return <div className={clsx('px-4 py-3 border-b border-gray-200', className)}>{children}</div>;
}

export function CardContent({ className, children }: CardProps) {
  return <div className={clsx('p-4', className)}>{children}</div>;
}
```

---

## 8. Workflow Components

### `apps/web/src/components/workflow/WorkflowStatusBadge.tsx`
```tsx
import { Badge } from '@/components/ui/Badge';
import { WorkflowState } from '@/api/client';

interface WorkflowStatusBadgeProps {
  state: WorkflowState;
}

const stateConfig: Record<WorkflowState, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  INGESTED: { label: 'Ingested', variant: 'default' },
  PATCHES_PROPOSED: { label: 'Patches Proposed', variant: 'info' },
  WAITING_USER_APPROVAL: { label: 'Awaiting Approval', variant: 'warning' },
  APPLYING_PATCHES: { label: 'Applying...', variant: 'info' },
  PR_OPEN: { label: 'PR Open', variant: 'info' },
  DONE: { label: 'Done', variant: 'success' },
  BLOCKED_POLICY: { label: 'Blocked', variant: 'error' },
  NEEDS_HUMAN: { label: 'Needs Input', variant: 'warning' },
  FAILED: { label: 'Failed', variant: 'error' },
};

export function WorkflowStatusBadge({ state }: WorkflowStatusBadgeProps) {
  const config = stateConfig[state] || { label: state, variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

### `apps/web/src/components/workflow/WorkflowCard.tsx`
```tsx
import { Link } from 'react-router-dom';
import { GitBranch, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { Workflow } from '@/api/client';

interface WorkflowCardProps {
  workflow: Workflow;
}

export function WorkflowCard({ workflow }: WorkflowCardProps) {
  const createdAt = new Date(workflow.createdAt).toLocaleString();

  return (
    <Link to={`/workflows/${workflow.id}`}>
      <Card className="hover:border-blue-300 transition-colors cursor-pointer">
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-gray-400" />
              <span className="font-mono text-sm">{workflow.id.slice(0, 8)}</span>
            </div>
            <WorkflowStatusBadge state={workflow.state} />
          </div>
          {workflow.baseSha && (
            <div className="mt-2 text-sm text-gray-500">
              Base: <code>{workflow.baseSha.slice(0, 7)}</code>
            </div>
          )}
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
            <Clock className="w-4 h-4" />
            {createdAt}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

### `apps/web/src/components/workflow/WorkflowTimeline.tsx`
```tsx
import { WorkflowEvent } from '@/api/client';
import { CheckCircle, AlertCircle, Info, GitCommit } from 'lucide-react';

interface WorkflowTimelineProps {
  events: WorkflowEvent[];
}

const eventIcons: Record<string, typeof CheckCircle> = {
  created: CheckCircle,
  state_changed: GitCommit,
  approval_recorded: CheckCircle,
  error: AlertCircle,
};

export function WorkflowTimeline({ events }: WorkflowTimelineProps) {
  return (
    <div className="space-y-4">
      {events.map((event) => {
        const Icon = eventIcons[event.type] || Info;
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex-shrink-0">
              <Icon className="w-5 h-5 text-gray-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{event.type}</span>
                <span className="text-xs text-gray-400">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
              <pre className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-auto">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 9. Patch Components

### `apps/web/src/components/patch/PatchDiffViewer.tsx`
```tsx
import { useMemo } from 'react';
import { PolicyViolation } from '@/api/client';

interface PatchDiffViewerProps {
  diff: string;
  violations?: PolicyViolation[];
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'header';
  content: string;
  lineNumber?: number;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n');
  return lines.map((line) => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff')) {
      return { type: 'header', content: line };
    }
    if (line.startsWith('@@')) {
      return { type: 'hunk', content: line };
    }
    if (line.startsWith('+')) {
      return { type: 'add', content: line };
    }
    if (line.startsWith('-')) {
      return { type: 'del', content: line };
    }
    return { type: 'context', content: line };
  });
}

export function PatchDiffViewer({ diff, violations = [] }: PatchDiffViewerProps) {
  const lines = useMemo(() => parseDiff(diff), [diff]);

  const lineStyles: Record<DiffLine['type'], string> = {
    add: 'bg-green-50 text-green-800',
    del: 'bg-red-50 text-red-800',
    context: '',
    hunk: 'bg-blue-50 text-blue-600 font-medium',
    header: 'bg-gray-100 text-gray-600 font-medium',
  };

  return (
    <div className="font-mono text-sm overflow-auto border rounded-lg">
      <pre className="p-0 m-0">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={`px-4 py-0.5 ${lineStyles[line.type]} border-l-2 ${
              line.type === 'add' ? 'border-green-500' : line.type === 'del' ? 'border-red-500' : 'border-transparent'
            }`}
          >
            {line.content || ' '}
          </div>
        ))}
      </pre>
      {violations.length > 0 && (
        <div className="border-t p-4 bg-red-50">
          <h4 className="font-medium text-red-800 mb-2">Policy Violations</h4>
          {violations.map((v) => (
            <div key={v.id} className="flex items-start gap-2 text-sm text-red-700">
              <span>{v.severity === 'BLOCK' ? '🚫' : '⚠️'}</span>
              <span>
                <strong>{v.rule}</strong>: {v.message}
                {v.line && <span className="text-gray-500"> (line {v.line})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### `apps/web/src/components/patch/PatchCard.tsx`
```tsx
import { Link } from 'react-router-dom';
import { FileCode, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Patch } from '@/api/client';

interface PatchCardProps {
  patch: Patch;
}

const riskColors = {
  low: 'success',
  med: 'warning',
  high: 'error',
} as const;

export function PatchCard({ patch }: PatchCardProps) {
  return (
    <Link to={`/patches/${patch.id}`}>
      <Card className="hover:border-blue-300 transition-colors cursor-pointer">
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium">{patch.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{patch.summary}</p>
            </div>
            <Badge variant={riskColors[patch.riskLevel]}>
              {patch.riskLevel.toUpperCase()} risk
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <FileCode className="w-4 h-4" />
              {patch.files.length} file(s)
            </span>
            <span className="text-green-600">+{patch.files.reduce((a, f) => a + f.additions, 0)}</span>
            <span className="text-red-600">-{patch.files.reduce((a, f) => a + f.deletions, 0)}</span>
            {patch.addsTests && (
              <span className="flex items-center gap-1 text-blue-600">
                <CheckCircle className="w-4 h-4" />
                Includes tests
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

---

## 10. Approval Components

### `apps/web/src/components/approval/ApproveDialog.tsx`
```tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api, PatchSet } from '@/api/client';

interface ApproveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  patchSet: PatchSet;
  onApproved: () => void;
}

export function ApproveDialog({ isOpen, onClose, workflowId, patchSet, onApproved }: ApproveDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    if (!confirmed) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.workflows.approve(workflowId, patchSet.id);
      onApproved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Approve Changes">
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium">{patchSet.title}</h4>
          <p className="text-sm text-gray-600 mt-1">
            {patchSet.patches.length} patch(es) • Base: {patchSet.baseSha.slice(0, 7)}
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm">I have reviewed all changes and approve this patch set</span>
        </label>

        {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApprove} isLoading={isLoading} disabled={!confirmed}>
            Approve & Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

### `apps/web/src/components/approval/RejectDialog.tsx`
```tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api, PatchSet } from '@/api/client';

interface RejectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  patchSet: PatchSet;
  onRejected: () => void;
}

export function RejectDialog({ isOpen, onClose, workflowId, patchSet, onRejected }: RejectDialogProps) {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReject = async () => {
    if (!reason.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.workflows.reject(workflowId, patchSet.id, reason);
      onRejected();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reject Patch Set">
      <div className="space-y-4">
        <div className="bg-red-50 p-4 rounded-lg">
          <h4 className="font-medium">{patchSet.title}</h4>
          <p className="text-sm text-gray-600 mt-1">
            This action will reject the patch set and mark it as rejected.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Reason for rejection</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please explain why you're rejecting this patch set..."
            className="w-full border rounded-lg p-2 h-24 resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReject} isLoading={isLoading} disabled={!reason.trim()}>
            Reject
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

### `apps/web/src/components/approval/RequestChangesDialog.tsx`
```tsx
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api, PatchSet } from '@/api/client';

interface RequestChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  patchSet: PatchSet;
  onRequested: () => void;
}

export function RequestChangesDialog({ isOpen, onClose, workflowId, patchSet, onRequested }: RequestChangesDialogProps) {
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    if (!comment.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.workflows.requestChanges(workflowId, patchSet.id, comment);
      onRequested();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Changes">
      <div className="space-y-4">
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-medium">{patchSet.title}</h4>
          <p className="text-sm text-gray-600 mt-1">
            Request modifications before approval. The system will attempt to regenerate patches.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">What changes are needed?</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe the changes you'd like to see..."
            className="w-full border rounded-lg p-2 h-24 resize-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
          />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleRequest} isLoading={isLoading} disabled={!comment.trim()}>
            Request Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

---

## 11. Pages

### `apps/web/src/pages/WorkflowsPage.tsx`
```tsx
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { WorkflowCard } from '@/components/workflow/WorkflowCard';
import { useWorkflows } from '@/hooks/useWorkflows';

export function WorkflowsPage() {
  const { data, isLoading, error, refetch } = useWorkflows({ limit: 20 });
  const [search, setSearch] = useState('');

  const workflows = data?.items.filter(
    (w) => !search || w.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle={`${data?.total ?? 0} total workflows`}
        actions={
          <Button variant="ghost" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">
          Error loading workflows: {error.message}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-center py-12 text-gray-500">Loading workflows...</div>
      ) : workflows?.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No workflows found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows?.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### `apps/web/src/pages/WorkflowDetailPage.tsx`
```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { WorkflowStatusBadge } from '@/components/workflow/WorkflowStatusBadge';
import { WorkflowTimeline } from '@/components/workflow/WorkflowTimeline';
import { PatchCard } from '@/components/patch/PatchCard';
import { ApproveDialog } from '@/components/approval/ApproveDialog';
import { RejectDialog } from '@/components/approval/RejectDialog';
import { RequestChangesDialog } from '@/components/approval/RequestChangesDialog';
import { useWorkflow } from '@/hooks/useWorkflow';

type Tab = 'overview' | 'patches' | 'artifacts' | 'timeline';

export function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workflow, isLoading, error, refetch } = useWorkflow(id!);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);

  if (isLoading) {
    return <div className="text-center py-12">Loading workflow...</div>;
  }

  if (error || !workflow) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        Error: {error?.message || 'Workflow not found'}
      </div>
    );
  }

  const currentPatchSet = workflow.patchSets?.[0];
  const canApprove = workflow.state === 'WAITING_USER_APPROVAL' && currentPatchSet?.status === 'proposed';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'patches', label: `Patches (${workflow.patchSets?.length ?? 0})` },
    { id: 'artifacts', label: `Artifacts (${workflow.artifacts?.length ?? 0})` },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div>
      <Link to="/workflows" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Workflows
      </Link>

      <PageHeader
        title={`Workflow ${workflow.id.slice(0, 8)}`}
        actions={
          <div className="flex items-center gap-2">
            <WorkflowStatusBadge state={workflow.state} />
            <Button variant="ghost" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {/* Action buttons */}
      {canApprove && (
        <div className="flex gap-2 mb-6">
          <Button onClick={() => setApproveOpen(true)}>Approve</Button>
          <Button variant="secondary" onClick={() => setRequestChangesOpen(true)}>
            Request Changes
          </Button>
          <Button variant="danger" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>Details</CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">ID</dt>
                  <dd className="font-mono">{workflow.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">State</dt>
                  <dd>{workflow.state}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Base SHA</dt>
                  <dd className="font-mono">{workflow.baseSha?.slice(0, 7) || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Created</dt>
                  <dd>{new Date(workflow.createdAt).toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Updated</dt>
                  <dd>{new Date(workflow.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {currentPatchSet && (
            <Card>
              <CardHeader>Current Patch Set</CardHeader>
              <CardContent>
                <h4 className="font-medium">{currentPatchSet.title}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  {currentPatchSet.patches.length} patch(es) • Status: {currentPatchSet.status}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'patches' && (
        <div className="space-y-4">
          {workflow.patchSets?.map((ps) => (
            <Card key={ps.id}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <span className="font-medium">{ps.title}</span>
                  <span className="text-sm text-gray-500">{ps.status}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ps.patches.map((patch) => (
                    <PatchCard key={patch.id} patch={patch} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {!workflow.patchSets?.length && (
            <div className="text-center py-12 text-gray-500">No patch sets yet</div>
          )}
        </div>
      )}

      {activeTab === 'artifacts' && (
        <div className="space-y-4">
          {workflow.artifacts?.map((artifact) => (
            <Card key={artifact.id}>
              <CardHeader>
                <span className="font-mono text-sm">{artifact.kind}</span>
              </CardHeader>
              <CardContent>
                <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded overflow-auto max-h-96">
                  {artifact.content}
                </pre>
              </CardContent>
            </Card>
          ))}
          {!workflow.artifacts?.length && (
            <div className="text-center py-12 text-gray-500">No artifacts yet</div>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <Card>
          <CardContent>
            {workflow.events?.length ? (
              <WorkflowTimeline events={workflow.events} />
            ) : (
              <div className="text-center py-12 text-gray-500">No events yet</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {currentPatchSet && (
        <>
          <ApproveDialog
            isOpen={approveOpen}
            onClose={() => setApproveOpen(false)}
            workflowId={workflow.id}
            patchSet={currentPatchSet}
            onApproved={refetch}
          />
          <RejectDialog
            isOpen={rejectOpen}
            onClose={() => setRejectOpen(false)}
            workflowId={workflow.id}
            patchSet={currentPatchSet}
            onRejected={refetch}
          />
          <RequestChangesDialog
            isOpen={requestChangesOpen}
            onClose={() => setRequestChangesOpen(false)}
            workflowId={workflow.id}
            patchSet={currentPatchSet}
            onRequested={refetch}
          />
        </>
      )}
    </div>
  );
}
```

### `apps/web/src/pages/PatchDetailPage.tsx`
```tsx
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Copy, FileCode, CheckCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PatchDiffViewer } from '@/components/patch/PatchDiffViewer';
import { usePatch } from '@/hooks/usePatch';

export function PatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { patch, isLoading, error } = usePatch(id!);

  const handleCopyDiff = () => {
    if (patch) {
      navigator.clipboard.writeText(patch.diff);
    }
  };

  if (isLoading) {
    return <div className="text-center py-12">Loading patch...</div>;
  }

  if (error || !patch) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        Error: {error?.message || 'Patch not found'}
      </div>
    );
  }

  const riskColors = { low: 'success', med: 'warning', high: 'error' } as const;
  const totalAdditions = patch.files.reduce((a, f) => a + f.additions, 0);
  const totalDeletions = patch.files.reduce((a, f) => a + f.deletions, 0);

  return (
    <div>
      <Link to="/workflows" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <PageHeader
        title={patch.title}
        actions={
          <Button variant="secondary" onClick={handleCopyDiff}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Diff
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-gray-500">Risk Level</div>
            <Badge variant={riskColors[patch.riskLevel]}>{patch.riskLevel.toUpperCase()}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-gray-500">Files Changed</div>
            <div className="font-medium">{patch.files.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-sm text-gray-500">Lines Changed</div>
            <div>
              <span className="text-green-600">+{totalAdditions}</span>{' '}
              <span className="text-red-600">-{totalDeletions}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>Summary</CardHeader>
        <CardContent>
          <p className="text-gray-600">{patch.summary}</p>
          {patch.addsTests && (
            <div className="mt-3 flex items-center gap-2 text-blue-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              This patch includes test coverage
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>Files</CardHeader>
        <CardContent>
          <ul className="divide-y">
            {patch.files.map((file) => (
              <li key={file.path} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-gray-400" />
                  <code className="text-sm">{file.path}</code>
                </div>
                <div className="text-sm">
                  <span className="text-green-600">+{file.additions}</span>{' '}
                  <span className="text-red-600">-{file.deletions}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {patch.proposedCommands.length > 0 && (
        <Card className="mb-6">
          <CardHeader>Proposed Commands</CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {patch.proposedCommands.map((cmd, idx) => (
                <li key={idx} className="font-mono text-sm bg-gray-100 px-3 py-1 rounded">
                  {cmd}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>Diff</CardHeader>
        <CardContent className="p-0">
          <PatchDiffViewer diff={patch.diff} />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 12. Component Index

### `apps/web/src/components/ui/index.ts`
```ts
export * from './Badge';
export * from './Button';
export * from './Card';
export * from './Modal';
```

### `apps/web/src/components/workflow/index.ts`
```ts
export * from './WorkflowCard';
export * from './WorkflowStatusBadge';
export * from './WorkflowTimeline';
```

### `apps/web/src/components/patch/index.ts`
```ts
export * from './PatchCard';
export * from './PatchDiffViewer';
```

### `apps/web/src/components/approval/index.ts`
```ts
export * from './ApproveDialog';
export * from './RejectDialog';
export * from './RequestChangesDialog';
```

---

## Usage

```bash
# From monorepo root
cd apps/web
npm install
npm run dev
# Open http://localhost:5173
```

Make sure the API is running on port 3000 or update `VITE_API_BASE_URL` in `.env`.

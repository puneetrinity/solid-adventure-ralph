# Frontend Specification

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Vite + React 18 | Fast dev, simple, no SSR needed |
| Language | TypeScript | Type safety |
| Routing | React Router v6 | Standard, simple |
| Styling | Tailwind CSS | Utility-first |
| State | useState + Context | Minimal deps, simple app |
| Data Fetching | fetch + custom hooks | No need for heavy libs |
| Real-time | Polling (3-5s) | Simpler than SSE for MVP |
| Icons | Lucide React | Lightweight |
| Code Display | Pre + monospace CSS | Simple diff viewer |

---

## Project Structure

```
apps/web/
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Router setup
│   ├── api/
│   │   └── client.ts               # API client (fetchJson)
│   ├── pages/
│   │   ├── WorkflowsPage.tsx       # /workflows
│   │   ├── WorkflowDetailPage.tsx  # /workflows/:id
│   │   └── PatchDetailPage.tsx     # /patches/:id
│   ├── components/
│   ├── ui/                         # Shadcn components
│   ├── workflow/
│   │   ├── workflow-card.tsx
│   │   ├── workflow-list.tsx
│   │   ├── workflow-detail.tsx
│   │   ├── workflow-timeline.tsx
│   │   └── workflow-status-badge.tsx
│   ├── patch/
│   │   ├── patch-set-card.tsx
│   │   ├── patch-list.tsx
│   │   ├── patch-diff-viewer.tsx
│   │   └── patch-policy-badge.tsx
│   ├── artifact/
│   │   ├── artifact-list.tsx
│   │   └── artifact-viewer.tsx
│   ├── approval/
│   │   ├── approval-dialog.tsx
│   │   ├── reject-dialog.tsx
│   │   └── approval-history.tsx
│   └── layout/
│       ├── header.tsx
│       ├── sidebar.tsx
│       └── breadcrumb.tsx
├── lib/
│   ├── api.ts                      # API client
│   ├── sse.ts                      # SSE connection
│   └── utils.ts
├── hooks/
│   ├── use-workflow.ts
│   ├── use-workflows.ts
│   ├── use-patches.ts
│   └── use-sse.ts
├── stores/
│   └── app-store.ts                # Zustand store
└── types/
    └── index.ts                    # Shared types
```

---

## Pages

### 1. Dashboard Home (`/`)

**Purpose:** Overview of all workflows and system health

**Components:**
- Stats cards (total workflows, pending approval, in progress, done)
- Recent workflows list (last 10)
- Quick actions (create workflow)

**Data:**
```ts
GET /api/workflows?limit=10&sort=updatedAt:desc
GET /api/stats
```

---

### 2. Workflow List (`/workflows`)

**Purpose:** Browse and filter all workflows

**Components:**
- Filter bar (status, date range, repo)
- Workflow cards in grid or list view
- Pagination
- Search

**Filters:**
- Status: ALL | INGESTED | PATCHES_PROPOSED | WAITING_USER_APPROVAL | PR_OPEN | DONE | BLOCKED_POLICY | FAILED
- Sort: newest | oldest | recently updated

**Data:**
```ts
GET /api/workflows?status=X&page=1&limit=20
```

---

### 3. Workflow Detail (`/workflows/[id]`)

**Purpose:** View workflow state, artifacts, patches, and take actions

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Header: Title + Status Badge + Actions              │
├─────────────────────────────────────────────────────┤
│ Tabs: Overview | Artifacts | Patches | Timeline     │
├─────────────────────────────────────────────────────┤
│ Tab Content                                         │
└─────────────────────────────────────────────────────┘
```

**Tabs:**

#### Overview Tab
- State diagram showing current position
- Key metadata (repo, base SHA, created at)
- Current patch set summary
- Quick actions based on state

#### Artifacts Tab
- List of artifacts (Decision, Architecture, Scope, Plan, etc.)
- Click to view content
- Markdown rendering

#### Patches Tab
- Patch set selector (if multiple)
- Patch list with:
  - Title, summary
  - Risk level badge
  - Policy status (OK / WARN / BLOCK)
  - Files changed
- Expand to view diff
- Approve / Reject buttons (when in WAITING_USER_APPROVAL)

#### Timeline Tab
- Chronological event list
- Event type icons
- Expandable payload details
- Filter by event type

**Actions (state-dependent):**
| State | Available Actions |
|-------|-------------------|
| WAITING_USER_APPROVAL | Approve, Reject, Request Changes |
| BLOCKED_POLICY | View Violations, Override (with reason) |
| NEEDS_HUMAN | Provide Input, Cancel |
| PR_OPEN | View PR (external link) |

**Data:**
```ts
GET /api/workflows/:id
GET /api/workflows/:id/patch_sets
GET /api/workflows/:id/events
SSE /api/workflows/:id/stream (real-time updates)
```

---

### 4. Patch Diff Viewer (`/workflows/[id]/patches`)

**Purpose:** Detailed diff review with policy status

**Components:**
- Side-by-side or unified diff view
- Syntax highlighting
- Policy violation inline markers
- File tree navigation
- Comment/note support (future)

**Diff Display:**
```
┌──────────────────────────────────────────────────────┐
│ File: src/app.module.ts                    [Expand]  │
├──────────────────────────────────────────────────────┤
│  10   import { Module } from '@nestjs/common';       │
│  11 - import { OldService } from './old.service';    │
│  11 + import { NewService } from './new.service';    │
│  12   ...                                            │
└──────────────────────────────────────────────────────┘
```

**Policy Violations Display:**
```
⚠️ WARN: New dependency added (package.json)
🚫 BLOCK: Modifies frozen file (.ai/REQUIREMENTS.md)
```

---

### 5. Settings (`/settings`)

**Purpose:** User preferences and configuration

**Sections:**
- Profile (GitHub connection status)
- Notifications (email, in-app)
- Display preferences (theme, diff view mode)
- API keys (future)

---

## Components Detail

### WorkflowStatusBadge
```tsx
type Status = 'INGESTED' | 'PATCHES_PROPOSED' | 'WAITING_USER_APPROVAL' | ...

const statusConfig = {
  INGESTED: { color: 'gray', label: 'Ingested' },
  PATCHES_PROPOSED: { color: 'blue', label: 'Patches Proposed' },
  WAITING_USER_APPROVAL: { color: 'yellow', label: 'Awaiting Approval' },
  APPLYING_PATCHES: { color: 'blue', label: 'Applying...' },
  PR_OPEN: { color: 'purple', label: 'PR Open' },
  DONE: { color: 'green', label: 'Done' },
  BLOCKED_POLICY: { color: 'red', label: 'Blocked' },
  NEEDS_HUMAN: { color: 'orange', label: 'Needs Input' },
  FAILED: { color: 'red', label: 'Failed' },
}
```

### ApprovalDialog
```tsx
interface ApprovalDialogProps {
  workflowId: string;
  patchSetId: string;
  onApprove: () => void;
  onCancel: () => void;
}

// Shows:
// - Patch set summary
// - Policy check results
// - Confirmation checkbox: "I have reviewed the changes"
// - Approve / Cancel buttons
```

### PatchDiffViewer
```tsx
interface PatchDiffViewerProps {
  diff: string;
  violations?: PolicyViolation[];
  viewMode: 'split' | 'unified';
}

// Uses Monaco Editor or react-diff-viewer
// Highlights violation lines
// Collapsible file sections
```

---

## State Management (Zustand)

```ts
interface AppState {
  // Current user
  user: User | null;

  // UI state
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  diffViewMode: 'split' | 'unified';

  // Actions
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: string) => void;
  setDiffViewMode: (mode: string) => void;
}
```

---

## API Client

```ts
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const api = {
  workflows: {
    list: (params?: WorkflowListParams) =>
      fetch(`${API_BASE}/api/workflows?${qs(params)}`),
    get: (id: string) =>
      fetch(`${API_BASE}/api/workflows/${id}`),
    approve: (id: string, patchSetId: string) =>
      fetch(`${API_BASE}/api/workflows/${id}/actions/approve`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId }),
      }),
    reject: (id: string, patchSetId: string, reason: string) =>
      fetch(`${API_BASE}/api/workflows/${id}/actions/reject`, {
        method: 'POST',
        body: JSON.stringify({ patchSetId, reason }),
      }),
  },
  patches: {
    get: (id: string) =>
      fetch(`${API_BASE}/api/patches/${id}`),
  },
};
```

---

## Real-time Updates (Polling for MVP)

For MVP, we use polling instead of SSE for simplicity:

```ts
// src/hooks/use-workflow-polling.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const POLL_INTERVAL = 3000; // 3 seconds
const TERMINAL_STATES = ['DONE', 'FAILED', 'NEEDS_HUMAN', 'BLOCKED_POLICY'];

export function useWorkflowPolling(workflowId: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkflow = useCallback(async () => {
    try {
      const data = await api.workflows.get(workflowId);
      setWorkflow(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchWorkflow();

    const interval = setInterval(() => {
      // Stop polling on terminal states
      if (workflow && TERMINAL_STATES.includes(workflow.state)) {
        return;
      }
      fetchWorkflow();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchWorkflow, workflow?.state]);

  return { workflow, isLoading, error, refetch: fetchWorkflow };
}
```

Future SSE implementation (Phase 12+):
```ts
// src/hooks/use-workflow-stream.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL;

export function useWorkflowStream(workflowId: string) {
  const [events, setEvents] = useState<WorkflowEvent[]>([]);

  useEffect(() => {
    const source = new EventSource(
      `${API_BASE}/api/workflows/${workflowId}/stream`,
      { withCredentials: true }
    );

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents(prev => [...prev, data]);
    };

    source.onerror = () => {
      source.close();
      // Fallback to polling
    };

    return () => source.close();
  }, [workflowId]);

  return events;
}
```

---

## Authentication

Using GitHub OAuth with custom implementation (Vite + React):

```ts
// src/auth/github-auth.ts
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const API_BASE = import.meta.env.VITE_API_BASE_URL;

export function initiateGitHubLogin() {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: 'read:user',
  });
  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

// src/auth/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check session on mount
    fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => setUser(data?.user ?? null))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login: initiateGitHubLogin,
      logout: () => fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
        .then(() => setUser(null)),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext)!;
```

Backend auth endpoints (NestJS):
```ts
// apps/api/src/auth/auth.controller.ts
@Controller('api/auth')
export class AuthController {
  @Get('callback')
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    // Exchange code for token, validate user, set session cookie
    const token = await this.authService.exchangeCode(code);
    const user = await this.authService.getUser(token);

    // Single-user check
    if (user.id !== process.env.ALLOWED_GITHUB_USER_ID) {
      return res.redirect('/unauthorized');
    }

    // Set HTTP-only session cookie
    res.cookie('session', this.authService.createSession(user), { httpOnly: true });
    res.redirect('/');
  }

  @Get('session')
  getSession(@Req() req: Request) {
    return { user: req.session?.user ?? null };
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('session');
    res.json({ ok: true });
  }
}
```

---

## Design Tokens

```css
/* Consistent with Shadcn defaults */
:root {
  --radius: 0.5rem;

  /* Status colors */
  --status-ingested: hsl(0 0% 45%);
  --status-proposed: hsl(217 91% 60%);
  --status-waiting: hsl(48 96% 53%);
  --status-applying: hsl(217 91% 60%);
  --status-pr-open: hsl(271 91% 65%);
  --status-done: hsl(142 76% 36%);
  --status-blocked: hsl(0 84% 60%);
  --status-needs-human: hsl(25 95% 53%);
  --status-failed: hsl(0 84% 60%);
}
```

---

## Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 640px | Single column, bottom nav |
| Tablet | 640-1024px | Collapsible sidebar |
| Desktop | > 1024px | Full sidebar + content |

---

## Accessibility

- All interactive elements keyboard accessible
- ARIA labels on icons and status badges
- Color not sole indicator (icons + text + color)
- Focus visible states
- Screen reader announcements for status changes

---

## Future Enhancements

- [ ] Dark mode
- [ ] Keyboard shortcuts (j/k navigation, a to approve)
- [ ] Batch operations (approve multiple)
- [ ] Diff comments / annotations
- [ ] Cost/token usage dashboard
- [ ] Workflow templates
- [ ] Mobile app (React Native)

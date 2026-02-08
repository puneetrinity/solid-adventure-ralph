# arch-orchestrator Web Dashboard

React + Vite web dashboard for the arch-orchestrator workflow engine.

## Overview

The dashboard provides:

- Workflow list with filtering and search
- Workflow detail view with tabs (Overview, Timeline, Artifacts, Patches)
- Patch diff viewer with syntax highlighting
- Approval/rejection/request changes actions
- Real-time polling for updates
- GitHub OAuth authentication

## Features

### Workflow List

- Paginated table view
- Status badges with color coding
- Search by workflow ID
- Filter by status
- Auto-refresh every 30 seconds

### Workflow Detail

- **Overview Tab**: Current state, latest patch set, recent events
- **Timeline Tab**: Expandable event history with payloads
- **Artifacts Tab**: View generated artifacts
- **Patches Tab**: Browse patch sets and patches

### Approval Actions

- Approve: Accept the proposed changes
- Reject: Decline with a reason
- Request Changes: Ask for modifications

### Authentication

- GitHub OAuth with single-user allowlist
- Protected routes requiring login
- Session persisted via HTTP-only cookie

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API base URL | `http://localhost:3000` |

## Tech Stack

- React 19
- Vite 7
- TypeScript 5.9
- Tailwind CSS 3
- React Router 7
- Lucide React icons

## Project Structure

```
src/
├── api/
│   └── client.ts       # API client
├── components/
│   ├── layout/         # Header, Sidebar, Layout
│   ├── patch/          # DiffViewer
│   ├── ui/             # Modal, Toast
│   └── workflow/       # StatusBadge
├── context/
│   └── AuthContext.tsx # Auth state management
├── hooks/
│   ├── use-workflows.ts
│   └── use-workflow.ts
├── pages/
│   ├── DashboardPage.tsx
│   ├── WorkflowsPage.tsx
│   ├── WorkflowDetailPage.tsx
│   ├── PatchDetailPage.tsx
│   ├── LoginPage.tsx
│   └── AuthCallbackPage.tsx
└── types/
    └── index.ts        # TypeScript types
```

## Deployment

### Railway

Using nginx for SPA routing:

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/"
healthcheckTimeout = 30
```

Set `VITE_API_BASE_URL` as a build-time variable in Railway.

### Docker

```bash
docker build -t arch-orchestrator-web \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  .

docker run -p 80:80 arch-orchestrator-web
```

## License

MIT

# arch-orchestrator API

NestJS REST API for the arch-orchestrator workflow engine.

## Overview

The API provides:

- Workflow CRUD operations
- Approval/rejection endpoints
- Patch viewing
- Authentication via GitHub OAuth
- OpenAPI documentation

## Endpoints

### Health

- `GET /api/health` - Health check

### Workflows

- `GET /api/workflows` - List workflows (paginated)
- `POST /api/workflows` - Create workflow (auth required)
- `GET /api/workflows/:id` - Get workflow details
- `POST /api/workflows/:id/actions/approve` - Approve patch set (auth required)
- `POST /api/workflows/:id/actions/reject` - Reject patch set (auth required)
- `POST /api/workflows/:id/actions/request_changes` - Request changes (auth required)

### Patches

- `GET /api/patches/:id` - Get patch details with diff

### Auth

- `GET /api/auth/github` - Initiate GitHub OAuth
- `POST /api/auth/github/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

## API Documentation

Swagger UI is available at `/api/docs` when running.

To export the OpenAPI spec:

```bash
npm run generate:openapi
```

This creates `openapi.json` in the api directory.

## Development

```bash
# Start in development mode
npm run start:dev

# Type check
npm run typecheck

# Build
npm run build

# Start production
npm run start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API port | `3000` |
| `DATABASE_URL` | PostgreSQL URL | Required |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:5173` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | - |
| `JWT_SECRET` | JWT signing secret | Dev default |
| `ALLOWED_GITHUB_USERS` | Comma-separated usernames | - |
| `FRONTEND_URL` | Frontend URL for OAuth | `http://localhost:5173` |

## Deployment

### Railway

The `railway.toml` configures Railway deployment:

```toml
[build]
builder = "nixpacks"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
```

Set environment variables in Railway dashboard.

## License

MIT

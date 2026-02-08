# Environment Variables

Complete reference for all environment variables used in arch-orchestrator.

## Database

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/archorch` | Yes |

## Redis

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | Yes |

## GitHub

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `GITHUB_TOKEN` | Personal access token for API calls | `ghp_xxxxxxxxxxxx` | Yes (worker) |
| `GITHUB_CLIENT_ID` | OAuth app client ID | `Iv1.xxxxxxxxxx` | For auth |
| `GITHUB_CLIENT_SECRET` | OAuth app client secret | `xxxxxxxxxxxxxxxx` | For auth |
| `ALLOWED_GITHUB_USERS` | Comma-separated list of allowed usernames | `user1,user2` | For auth |

### Creating a GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Set:
   - **Application name**: arch-orchestrator
   - **Homepage URL**: Your frontend URL
   - **Authorization callback URL**: `{FRONTEND_URL}/auth/callback`
4. Copy the Client ID and generate a Client Secret

## Authentication

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret for signing JWT tokens | `your-secure-random-string` | For auth |
| `FRONTEND_URL` | Frontend URL for OAuth callbacks | `http://localhost:5173` | For auth |

**Security Note**: Always use a strong, random JWT_SECRET in production. Generate with:
```bash
openssl rand -base64 32
```

## API Server

| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `PORT` | API server port | `3000` | `3000` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:5173,https://app.example.com` | `http://localhost:5173,http://localhost:4173` |
| `NODE_ENV` | Environment mode | `production` | `development` |

## LLM (Anthropic)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-xxxxx` | For LLM |
| `LLM_MODEL` | Claude model to use | `claude-sonnet-4-20250514` | No |
| `LLM_MAX_TOKENS` | Maximum tokens per request | `4096` | No |

## Web Dashboard (Build-time)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `VITE_API_BASE_URL` | API base URL | `https://api.example.com` | Yes |

**Note**: Vite environment variables must be prefixed with `VITE_` and are embedded at build time.

## Example .env File

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/archorch"

# Redis
REDIS_URL="redis://localhost:6379"

# GitHub
GITHUB_TOKEN="ghp_your_personal_access_token"
GITHUB_CLIENT_ID="Iv1.your_client_id"
GITHUB_CLIENT_SECRET="your_client_secret"
ALLOWED_GITHUB_USERS="yourusername"

# Auth
JWT_SECRET="change-this-to-a-random-string"
FRONTEND_URL="http://localhost:5173"

# API
PORT=3000
CORS_ORIGINS="http://localhost:5173"

# LLM
ANTHROPIC_API_KEY="sk-ant-your_api_key"
```

## Production Considerations

1. **Never commit secrets**: Use environment variables or secret management services
2. **Use strong secrets**: Generate random strings for JWT_SECRET
3. **Restrict CORS**: Only allow your actual frontend domain
4. **Limit GitHub users**: Set ALLOWED_GITHUB_USERS to approved users only
5. **Secure cookies**: Ensure NODE_ENV=production for secure cookie settings

## Railway Configuration

In Railway, set environment variables in each service's Variables tab:

### API Service
- DATABASE_URL (from Railway PostgreSQL)
- REDIS_URL (from Railway Redis)
- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- JWT_SECRET
- ALLOWED_GITHUB_USERS
- FRONTEND_URL (public web URL)
- CORS_ORIGINS (public web URL)

### Worker Service
- DATABASE_URL (from Railway PostgreSQL)
- REDIS_URL (from Railway Redis)
- GITHUB_TOKEN
- ANTHROPIC_API_KEY

### Web Service
- VITE_API_BASE_URL (public API URL) - as build variable

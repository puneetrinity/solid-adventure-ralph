import { Controller, Get, Post, Query, Res, Req, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response, Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserResponseDto, AuthCallbackResponseDto, LogoutResponseDto, ErrorResponseDto } from './dto';
import { getPrisma } from '@arch-orchestrator/db';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_OAUTH_SCOPES = process.env.GITHUB_OAUTH_SCOPES || 'read:user repo';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const ALLOWED_USERS = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private prisma = getPrisma();
  // Prisma client is generated at build time. Use a narrow cast here to avoid
  // type errors if the client hasn't been regenerated yet.
  private get gitHubAuth() {
    return (this.prisma as unknown as { gitHubAuth: any }).gitHubAuth;
  }

  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }
    return req.cookies?.auth_token;
  }

  @Get('github')
  @ApiOperation({ summary: 'GitHub OAuth redirect', description: 'Redirects to GitHub for OAuth authentication' })
  @ApiResponse({ status: 302, description: 'Redirect to GitHub' })
  @ApiResponse({ status: 503, description: 'OAuth not configured', type: ErrorResponseDto })
  redirectToGitHub(@Res() res: Response) {
    if (!GITHUB_CLIENT_ID) {
      throw new HttpException(
        { errorCode: 'AUTH_NOT_CONFIGURED', message: 'GitHub OAuth is not configured' },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${FRONTEND_URL}/auth/callback`,
      scope: GITHUB_OAUTH_SCOPES,
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  }

  @Post('github/callback')
  @ApiOperation({ summary: 'GitHub OAuth callback', description: 'Handle GitHub OAuth callback and set auth cookie' })
  @ApiQuery({ name: 'code', description: 'GitHub authorization code' })
  @ApiResponse({ status: 200, description: 'Authentication successful', type: AuthCallbackResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid code', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication failed', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'User not authorized', type: ErrorResponseDto })
  async handleCallback(
    @Query('code') code: string,
    @Res({ passthrough: true }) res: Response
  ) {
    if (!code) {
      throw new HttpException(
        { errorCode: 'INVALID_CODE', message: 'Authorization code is required' },
        HttpStatus.BAD_REQUEST
      );
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      throw new HttpException(
        { errorCode: 'AUTH_NOT_CONFIGURED', message: 'GitHub OAuth is not configured' },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${FRONTEND_URL}/auth/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      this.logger.error(`GitHub token exchange failed: ${tokenResponse.status}`);
      throw new HttpException(
        { errorCode: 'GITHUB_AUTH_FAILED', message: 'Failed to authenticate with GitHub' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
    if (!tokenData.access_token) {
      this.logger.error(
        `No access token in GitHub response: ${JSON.stringify({
          error: tokenData.error,
          error_description: tokenData.error_description,
        })}`
      );
      throw new HttpException(
        { errorCode: 'GITHUB_AUTH_FAILED', message: 'Failed to authenticate with GitHub' },
        HttpStatus.UNAUTHORIZED
      );
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    if (!userResponse.ok) {
      this.logger.error(`GitHub user info failed: ${userResponse.status}`);
      throw new HttpException(
        { errorCode: 'GITHUB_AUTH_FAILED', message: 'Failed to get user info from GitHub' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const userData = (await userResponse.json()) as GitHubUserResponse;

    // Check if user is allowed
    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userData.login.toLowerCase())) {
      this.logger.warn(`Unauthorized user attempted login: ${userData.login}`);
      throw new HttpException(
        { errorCode: 'UNAUTHORIZED_USER', message: 'You are not authorized to access this application' },
        HttpStatus.FORBIDDEN
      );
    }

    // Generate JWT
    const token = jwt.sign(
      {
        sub: userData.id.toString(),
        username: userData.login,
        name: userData.name,
        avatarUrl: userData.avatar_url,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store GitHub access token for repo autocomplete
    await this.gitHubAuth.upsert({
      where: { githubUserId: userData.id.toString() },
      create: {
        githubUserId: userData.id.toString(),
        username: userData.login,
        accessToken: tokenData.access_token,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
      },
      update: {
        username: userData.login,
        accessToken: tokenData.access_token,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
      },
    });

    // Set cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction,
      // Cross-site requests from the web app require SameSite=None in production
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: COOKIE_MAX_AGE,
    });
    this.logger.log(
      `Set auth cookie (origin=${res.req?.headers?.origin ?? 'n/a'}, host=${res.req?.headers?.host ?? 'n/a'}, setCookie=${JSON.stringify(
        res.getHeader('Set-Cookie')
      )})`
    );

    return {
      ok: true,
      // Return token so the frontend can fall back to header auth when cookies are blocked
      token,
      user: {
        id: userData.id.toString(),
        username: userData.login,
        name: userData.name,
        avatarUrl: userData.avatar_url,
      },
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user', description: 'Get the currently authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  getMe(@Req() req: Request) {
    const token = this.extractToken(req);
    if (!token) {
      this.logger.warn(`Auth token missing (origin=${req.headers.origin ?? 'n/a'}, host=${req.headers.host ?? 'n/a'})`);
      throw new HttpException(
        { errorCode: 'NOT_AUTHENTICATED', message: 'Not authenticated' },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      return {
        id: decoded.sub,
        username: decoded.username,
        name: decoded.name,
        avatarUrl: decoded.avatarUrl,
      };
    } catch {
      this.logger.warn(`Invalid auth token (origin=${req.headers.origin ?? 'n/a'}, host=${req.headers.host ?? 'n/a'})`);
      throw new HttpException(
        { errorCode: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout', description: 'Clear authentication cookie' })
  @ApiResponse({ status: 200, description: 'Logged out successfully', type: LogoutResponseDto })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('auth_token');
    return { ok: true };
  }

  @Get('github/repos')
  @ApiOperation({ summary: 'List GitHub repositories', description: 'List repositories accessible by the authenticated user' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'per_page', required: false, description: 'Items per page', example: 100 })
  @ApiResponse({ status: 200, description: 'Repository list' })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  async listRepos(
    @Req() req: Request,
    @Query('page') pageParam?: string,
    @Query('per_page') perPageParam?: string
  ) {
    const token = this.extractToken(req);
    if (!token) {
      this.logger.warn(`Auth token missing (origin=${req.headers.origin ?? 'n/a'}, host=${req.headers.host ?? 'n/a'})`);
      throw new HttpException(
        { errorCode: 'NOT_AUTHENTICATED', message: 'Not authenticated' },
        HttpStatus.UNAUTHORIZED
      );
    }

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch {
      this.logger.warn(`Invalid auth token (origin=${req.headers.origin ?? 'n/a'}, host=${req.headers.host ?? 'n/a'})`);
      throw new HttpException(
        { errorCode: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const githubUserId = decoded.sub?.toString();
    if (!githubUserId) {
      throw new HttpException(
        { errorCode: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const auth = await this.gitHubAuth.findUnique({
      where: { githubUserId },
    });
    if (!auth) {
      throw new HttpException(
        { errorCode: 'GITHUB_AUTH_REQUIRED', message: 'GitHub OAuth is required to list repositories' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const page = Math.max(1, Number(pageParam) || 1);
    const perPage = Math.min(100, Math.max(1, Number(perPageParam) || 100));

    const repoResponse = await fetch(
      `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
      {
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'arch-orchestrator',
        },
      }
    );

    if (!repoResponse.ok) {
      this.logger.error(`GitHub repo list failed: ${repoResponse.status}`);
      throw new HttpException(
        { errorCode: 'GITHUB_API_FAILED', message: 'Failed to fetch repositories from GitHub' },
        HttpStatus.BAD_GATEWAY
      );
    }

    const repoData = (await repoResponse.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      owner: { login: string };
      default_branch: string;
      permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
    }>;

    return repoData.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch,
      permissions: repo.permissions ?? {},
    }));
  }
}

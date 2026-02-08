import { Controller, Get, Post, Query, Res, Req, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response, Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserResponseDto, AuthCallbackResponseDto, LogoutResponseDto, ErrorResponseDto } from './dto';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
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
      scope: 'read:user',
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

    // Set cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction,
      // Cross-site requests from the web app require SameSite=None in production
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: COOKIE_MAX_AGE,
    });

    return {
      ok: true,
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
    const token = req.cookies?.auth_token;
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
}

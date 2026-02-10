import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

export interface AuthUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const bypassUser = this.getBypassUser(request);
    if (bypassUser) {
      (request as AuthenticatedRequest).user = bypassUser;
      return true;
    }
    const authHeader = request.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : request.cookies?.auth_token;

    if (!token) {
      throw new HttpException(
        { errorCode: 'NOT_AUTHENTICATED', message: 'Authentication required' },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      (request as AuthenticatedRequest).user = {
        id: decoded.sub as string,
        username: decoded.username,
        name: decoded.name,
        avatarUrl: decoded.avatarUrl,
      };
      return true;
    } catch {
      throw new HttpException(
        { errorCode: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  private getBypassUser(request: Request): AuthUser | null {
    const bypassToken = process.env.AUTH_BYPASS_TOKEN;
    if (!bypassToken) {
      return null;
    }

    const headerToken = request.headers['x-auth-bypass'];
    const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    if (!token || token !== bypassToken) {
      return null;
    }

    const usernameHeader = request.headers['x-test-user'];
    const username = Array.isArray(usernameHeader)
      ? usernameHeader[0]
      : (usernameHeader || 'test-user');

    const idHeader = request.headers['x-test-user-id'];
    const id = Array.isArray(idHeader) ? idHeader[0] : (idHeader || 'test-user-id');

    const nameHeader = request.headers['x-test-user-name'];
    const name = Array.isArray(nameHeader) ? nameHeader[0] : (nameHeader || null);

    const avatarHeader = request.headers['x-test-user-avatar'];
    const avatarUrl = Array.isArray(avatarHeader)
      ? avatarHeader[0]
      : (avatarHeader || 'https://avatars.githubusercontent.com/u/0?v=4');

    return {
      id,
      username,
      name: name || null,
      avatarUrl
    };
  }
}

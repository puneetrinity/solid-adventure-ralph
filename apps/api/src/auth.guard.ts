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
    const token = request.cookies?.auth_token;

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
}

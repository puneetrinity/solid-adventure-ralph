import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface NormalizedError {
  errorCode: string;
  message: string;
  status?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let normalizedError: NormalizedError;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        normalizedError = {
          errorCode: this.statusToErrorCode(status),
          message: exceptionResponse,
        };
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        normalizedError = {
          errorCode: (resp.errorCode as string) || this.statusToErrorCode(status),
          message: (resp.message as string) || exception.message,
        };
      } else {
        normalizedError = {
          errorCode: this.statusToErrorCode(status),
          message: exception.message,
        };
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      normalizedError = {
        errorCode: 'INTERNAL_ERROR',
        message: exception.message || 'An unexpected error occurred',
      };
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      normalizedError = {
        errorCode: 'UNKNOWN_ERROR',
        message: 'An unknown error occurred',
      };
      this.logger.error(`Unknown error type: ${exception}`);
    }

    response.status(status).json(normalizedError);
  }

  private statusToErrorCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] || 'UNKNOWN_ERROR';
  }
}

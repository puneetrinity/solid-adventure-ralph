import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl } = req;

    // Extract workflowId from path if present
    const workflowIdMatch = originalUrl.match(/\/workflows\/([a-f0-9-]+)/i);
    const workflowId = workflowIdMatch ? workflowIdMatch[1] : undefined;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      const logParts = [
        `${method} ${originalUrl}`,
        `${statusCode}`,
        `${duration}ms`,
      ];

      if (workflowId) {
        logParts.push(`workflow=${workflowId}`);
      }

      const logMessage = logParts.join(' ');

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }
}

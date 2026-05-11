import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PerformanceMonitor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const executionTime = Date.now() - now;
        this.logger.log(`[AOP] Route: ${method} ${url} - Execution Time: ${executionTime}ms`);
      }),
    );
  }
}

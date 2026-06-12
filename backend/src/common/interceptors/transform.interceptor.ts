import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  statusCode: number;
  message: string;
}

/**
 * Wraps every successful response as:
 *   { data: <payload>, statusCode: 200, message: "success" }
 *
 * The frontend's api/client.ts interceptor does response.data to unwrap
 * the HTTP body — this structure means frontend code does:
 *   const result = await api.get('/path')  // returns { data, statusCode, message }
 *   result.data                            // the actual payload
 *
 * NOTE: The workflowApi/memoryApi in lib/api.ts already expects this shape
 * (.data access on the api response).
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode;
    return next.handle().pipe(
      map((data) => ({
        data,
        statusCode,
        message: 'success',
      })),
    );
  }
}

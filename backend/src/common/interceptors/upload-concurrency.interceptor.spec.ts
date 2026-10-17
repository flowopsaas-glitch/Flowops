import { CallHandler, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Observable, Subject, lastValueFrom, of, throwError } from 'rxjs';
import { UploadConcurrencyInterceptor } from './upload-concurrency.interceptor';

const context = {} as ExecutionContext;

describe('UploadConcurrencyInterceptor', () => {
  let interceptor: UploadConcurrencyInterceptor;

  beforeEach(() => {
    (UploadConcurrencyInterceptor as any).activeUploads = 0;
    interceptor = new UploadConcurrencyInterceptor();
  });

  it('bounds two simultaneous uploads and releases both slots on completion', () => {
    const firstPending = new Subject<void>();
    const secondPending = new Subject<void>();
    const first = interceptor.intercept(context, { handle: () => firstPending } as CallHandler).subscribe();
    const second = interceptor.intercept(context, { handle: () => secondPending } as CallHandler).subscribe();

    expect((UploadConcurrencyInterceptor as any).activeUploads).toBe(2);
    expect(() => interceptor.intercept(context, { handle: () => of(null) } as CallHandler))
      .toThrow(ServiceUnavailableException);

    firstPending.complete();
    expect((UploadConcurrencyInterceptor as any).activeUploads).toBe(1);
    secondPending.complete();
    expect((UploadConcurrencyInterceptor as any).activeUploads).toBe(0);
    first.unsubscribe();
    second.unsubscribe();
  });

  it('releases capacity after a handler error', async () => {
    const failed = interceptor.intercept(context, {
      handle: () => throwError(() => new Error('upload failed')) as Observable<unknown>,
    } as CallHandler);

    await expect(lastValueFrom(failed)).rejects.toThrow('upload failed');
    expect((UploadConcurrencyInterceptor as any).activeUploads).toBe(0);
  });

  it('releases capacity if the handler throws before returning an observable', () => {
    expect(() => interceptor.intercept(context, {
      handle: () => { throw new Error('synchronous failure'); },
    } as CallHandler)).toThrow('synchronous failure');
    expect((UploadConcurrencyInterceptor as any).activeUploads).toBe(0);
  });
});

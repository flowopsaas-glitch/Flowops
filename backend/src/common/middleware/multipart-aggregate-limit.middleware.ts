import { NextFunction, Request, RequestHandler, Response } from 'express';
import { multipartUploadByteLimit } from '../security/multipart-upload-limits';

const TOO_LARGE_BODY = JSON.stringify({
  statusCode: 413,
  message: 'Request body too large.',
  error: 'Payload Too Large',
});

/**
 * Enforce an aggregate raw-byte ceiling before Multer buffers any upload.
 * Content-Length is also checked by ApiShieldGuard; this middleware covers
 * chunked/lengthless bodies and closes rejected requests before they can leave
 * a paused socket or hold an upload slot open.
 */
export function createMultipartAggregateLimitMiddleware(
  resolveLimit: typeof multipartUploadByteLimit = multipartUploadByteLimit,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
    if (!contentType.startsWith('multipart/form-data')) return next();

    const path = request.path || String(request.url ?? '').split('?', 1)[0];
    const maxBytes = resolveLimit(request.method, path);
    if (maxBytes === null) return next();

    let receivedBytes = 0;
    let monitoring = true;

    const stopMonitoring = () => {
      if (!monitoring) return;
      monitoring = false;
      request.removeListener('data', onData);
      request.removeListener('end', stopMonitoring);
      request.removeListener('aborted', stopMonitoring);
    };

    const closeIfIncomplete = () => {
      stopMonitoring();
      // Guards can reject before Multer gets a chance to consume the body. Do
      // not leave the connection/socket pinned while the client keeps sending.
      if (!request.complete && !request.destroyed) request.destroy();
    };

    const onData = (chunk: Buffer | string) => {
      if (!monitoring) return;
      receivedBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      if (receivedBytes <= maxBytes) return;

      request.pause();
      stopMonitoring();
      if (!response.headersSent && !response.writableEnded) {
        response.statusCode = 413;
        response.setHeader('Connection', 'close');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Content-Length', String(Buffer.byteLength(TOO_LARGE_BODY)));
        response.end(TOO_LARGE_BODY);
      }
    };

    // Start paused so a chunked body cannot be consumed before the downstream
    // multipart parser is attached. Multer's request.pipe(busboy) resumes it.
    request.pause();
    request.on('data', onData);
    request.once('end', stopMonitoring);
    request.once('aborted', stopMonitoring);
    response.once('finish', closeIfIncomplete);
    response.once('close', closeIfIncomplete);
    next();
  };
}

export const multipartAggregateLimitMiddleware = createMultipartAggregateLimitMiddleware();

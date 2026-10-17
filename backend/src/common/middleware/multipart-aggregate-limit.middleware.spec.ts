import { createServer, request as httpRequest } from 'http';
import { AddressInfo } from 'net';
import {
  createMultipartAggregateLimitMiddleware,
} from './multipart-aggregate-limit.middleware';
import { multipartUploadByteLimit } from '../security/multipart-upload-limits';

const MIB = 1024 * 1024;

describe('multipart upload aggregate byte limits', () => {
  it.each([
    ['POST', '/api/v1/rail/schedules/import', 26],
    ['POST', '/api/v1/owner/rail/schedules/import', 26],
    ['POST', '/api/v1/email-hub/send', 26],
    ['POST', '/api/v1/email-hub/ingest', 26],
    ['POST', '/api/v1/waybills/wb-1/deliver', 15],
    ['POST', '/api/v1/waybills/inbox/upload', 11],
    ['POST', '/api/v1/companies/company-1/logo', 3],
    ['POST', '/api/v1/waybills/bulk-import', 6],
  ] as const)('sets the raw-stream and declared-length cap for %s %s', (method, path, maxMiB) => {
    expect(multipartUploadByteLimit(method, path)).toBe(maxMiB * MIB);
  });

  it('does not classify unrelated methods or routes as multipart upload endpoints', () => {
    expect(multipartUploadByteLimit('GET', '/api/v1/email-hub/send')).toBeNull();
    expect(multipartUploadByteLimit('POST', '/api/v1/waybills/wb-1/receipt')).toBeNull();
  });

  async function sendChunkedUpload(chunks: string[]) {
    const middleware = createMultipartAggregateLimitMiddleware((method, path) =>
      method === 'POST' && path === '/upload' ? 4 : null,
    );
    const server = createServer((request, response) => {
      middleware(request as any, response as any, () => {
        let received = 0;
        request.on('data', (chunk: Buffer) => { received += chunk.byteLength; });
        request.on('end', () => {
          response.statusCode = 200;
          response.end(String(received));
        });
        // This is what Multer's request.pipe(busboy) does after installing its listeners.
        request.resume();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const port = (server.address() as AddressInfo).port;
      return await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = httpRequest({
          method: 'POST',
          hostname: '127.0.0.1',
          port,
          path: '/upload',
          headers: {
            'content-type': 'multipart/form-data; boundary=test-boundary',
            'transfer-encoding': 'chunked',
            connection: 'close',
          },
        }, (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => { body += chunk; });
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        });
        request.once('error', reject);
        for (const chunk of chunks) request.write(chunk);
        request.end();
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('accepts a chunked multipart body exactly at the cap', async () => {
    await expect(sendChunkedUpload(['12', '34'])).resolves.toEqual({ status: 200, body: '4' });
  });

  it('returns 413 and closes a chunked upload as soon as aggregate raw bytes exceed the cap', async () => {
    const response = await sendChunkedUpload(['123', '45']);
    expect(response.status).toBe(413);
    expect(response.body).toContain('Request body too large');
  });
});

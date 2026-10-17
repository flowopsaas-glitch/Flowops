import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import type { UploadedFile } from './email-hub.service';

export const EMAIL_ATTACHMENT_MAX_FILES = 5;
export const EMAIL_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.tif': ['image/tiff'],
  '.tiff': ['image/tiff'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  '.rtf': ['application/rtf', 'text/rtf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};

function hasSignature(file: UploadedFile, extension: string, mimeType: string): boolean {
  const bytes = file.buffer;
  if (mimeType === 'application/pdf') return bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-';
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6));
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mimeType === 'image/tiff') return bytes.length >= 4 && (
    bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
    bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
  );
  if (mimeType === 'application/rtf' || mimeType === 'text/rtf') return bytes.toString('ascii', 0, 5) === '{\\rtf';
  if (['.docx', '.xlsx', '.pptx'].includes(extension)) return bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'PK\x03\x04';
  if (['.doc', '.xls', '.ppt'].includes(extension)) return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (
    mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/csv' ||
    (extension === '.csv' && mimeType === 'application/vnd.ms-excel')
  ) {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Strict allowlist for outbound email attachments; inbound documents are scanned separately. */
export function validateEmailAttachment(file: UploadedFile): void {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length !== file.size) {
    throw new BadRequestException('Attachment is empty or malformed');
  }
  if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
    throw new BadRequestException('Each attachment must be 5 MiB or smaller');
  }
  const filename = String(file.originalname ?? '');
  if (
    !filename || filename.length > 255 || filename.includes('/') || filename.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(filename) || filename === '.' || filename === '..'
  ) {
    throw new BadRequestException('Attachment filename is invalid');
  }

  const extension = extname(filename).toLowerCase();
  const mimeType = String(file.mimetype ?? '').toLowerCase().split(';', 1)[0].trim();
  const allowedMimeTypes = MIME_BY_EXTENSION[extension];
  if (!allowedMimeTypes || !allowedMimeTypes.includes(mimeType)) {
    throw new BadRequestException('Attachment type is not allowed; use a supported document, image, or text file');
  }
  if (!hasSignature(file, extension, mimeType)) {
    throw new BadRequestException('Attachment content does not match its declared file type');
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { basename, extname } from 'path';
import { Express } from 'express';

export interface FileValidationOptions {
  /** Maximum file size in bytes. Multer must enforce the same limit before buffering. */
  maxSize?: number;
  /** Content category to validate against. */
  category?: 'image' | 'document' | 'csv' | 'any';
}

type SignatureCheck = (buffer: Buffer) => boolean;

const IMAGE_SIGNATURES: Record<string, SignatureCheck> = {
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (b) => b.length >= 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a'),
  'image/webp': (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

const DOCUMENT_SIGNATURES: Record<string, SignatureCheck> = {
  'application/pdf': (b) => b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-',
  'image/jpeg': IMAGE_SIGNATURES['image/jpeg'],
  'image/png': IMAGE_SIGNATURES['image/png'],
  'image/tiff': (b) => b.length >= 4 && (
    b.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
    b.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
  ),
};

const CSV_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

@Injectable()
export class FileUploadValidator {
  static validate(file: Express.Multer.File, options: FileValidationOptions = {}): void {
    const { maxSize = 10 * 1024 * 1024, category = 'document' } = options;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('No valid file was uploaded');
    }

    const actualSize = file.buffer.length;
    if (actualSize === 0 || actualSize !== file.size) {
      throw new BadRequestException('Uploaded file is empty or malformed');
    }
    if (actualSize > maxSize) {
      throw new BadRequestException(`File too large. Maximum size: ${Math.floor(maxSize / 1024 / 1024)}MB`);
    }

    const originalname = String(file.originalname ?? '');
    if (!originalname || basename(originalname) !== originalname || originalname.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }

    const extension = extname(originalname).toLowerCase();
    const mimetype = String(file.mimetype ?? '').toLowerCase().split(';', 1)[0].trim();

    if (category === 'any') return;

    if (category === 'csv') {
      if (extension !== '.csv' || !CSV_MIMES.has(mimetype) || file.buffer.includes(0)) {
        throw new BadRequestException('Upload must be a valid text CSV file');
      }
      return;
    }

    FileUploadValidator.validateBuffer(file.buffer, mimetype, category);
  }

  static validateBuffer(
    buffer: Buffer,
    rawMimeType: string,
    category: 'image' | 'document',
  ): void {
    const mimetype = String(rawMimeType ?? '').toLowerCase().split(';', 1)[0].trim();
    const signatures = category === 'image' ? IMAGE_SIGNATURES : DOCUMENT_SIGNATURES;
    const signatureCheck = signatures[mimetype];
    if (!signatureCheck) {
      throw new BadRequestException(
        `File type '${mimetype || 'unknown'}' is not allowed for this upload`,
      );
    }
    if (!signatureCheck(buffer)) {
      throw new BadRequestException('File content does not match its declared type');
    }
  }
}

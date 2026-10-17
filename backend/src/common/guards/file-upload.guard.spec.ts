import { BadRequestException } from '@nestjs/common';
import { FileUploadValidator } from './file-upload.guard';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function uploadedFile(overrides: Record<string, unknown> = {}) {
  const buffer = (overrides.buffer as Buffer | undefined) ?? png;
  return {
    buffer,
    size: buffer.length,
    originalname: 'logo.png',
    mimetype: 'image/png',
    ...overrides,
  } as any;
}

describe('FileUploadValidator', () => {
  it('accepts a size-consistent PNG whose bytes match its declared MIME type', () => {
    expect(() => FileUploadValidator.validate(uploadedFile(), { category: 'image', maxSize: 1024 })).not.toThrow();
  });

  it('rejects absent, empty, size-mismatched, or over-limit files', () => {
    expect(() => FileUploadValidator.validate(undefined as any)).toThrow(BadRequestException);
    expect(() => FileUploadValidator.validate(uploadedFile({ buffer: Buffer.alloc(0), size: 0 }))).toThrow(BadRequestException);
    expect(() => FileUploadValidator.validate(uploadedFile({ size: png.length + 1 }))).toThrow(BadRequestException);
    expect(() => FileUploadValidator.validate(uploadedFile(), { maxSize: 4 })).toThrow(BadRequestException);
  });

  it('rejects traversal filenames and mismatched file signatures', () => {
    expect(() => FileUploadValidator.validate(uploadedFile({ originalname: '../logo.png' }), { category: 'image' }))
      .toThrow(BadRequestException);
    expect(() => FileUploadValidator.validate(uploadedFile({ mimetype: 'image/jpeg' }), { category: 'image' }))
      .toThrow(BadRequestException);
    expect(() => FileUploadValidator.validate(uploadedFile({ mimetype: 'application/x-msdownload' }), { category: 'image' }))
      .toThrow(BadRequestException);
  });

  it('accepts only text-like CSV uploads with a .csv extension', () => {
    const csv = Buffer.from('senderName,recipientName\nA,B\n', 'utf8');
    expect(() => FileUploadValidator.validate(uploadedFile({
      buffer: csv,
      size: csv.length,
      originalname: 'waybills.csv',
      mimetype: 'text/csv',
    }), { category: 'csv', maxSize: 1024 })).not.toThrow();

    expect(() => FileUploadValidator.validate(uploadedFile({
      buffer: csv,
      size: csv.length,
      originalname: 'waybills.exe',
      mimetype: 'text/csv',
    }), { category: 'csv' })).toThrow(BadRequestException);
    expect(() => FileUploadValidator.validate(uploadedFile({
      buffer: Buffer.from([0x41, 0x00, 0x42]),
      size: 3,
      originalname: 'waybills.csv',
      mimetype: 'text/csv',
    }), { category: 'csv' })).toThrow(BadRequestException);
  });
});

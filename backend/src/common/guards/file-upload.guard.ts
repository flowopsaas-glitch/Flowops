import { Injectable, BadRequestException } from '@nestjs/common';
import { Express } from 'express';

/**
 * World-class file upload validation utility.
 * Validates file type, size, and content (magic bytes) to prevent:
 * - Malicious file uploads (executables, scripts)
 * - Oversized uploads exhausting disk/memory
 * - MIME type spoofing attacks
 */

// Allowed file types with their magic bytes for content verification
const ALLOWED_TYPES: Record<string, { mimes: string[]; magic?: Buffer[] }> = {
  image: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
    magic: [
      Buffer.from([0xFF, 0xD8, 0xFF]),           // JPEG
      Buffer.from([0x89, 0x50, 0x4E, 0x47]),     // PNG
      Buffer.from([0x47, 0x49, 0x46]),            // GIF
      Buffer.from([0x52, 0x49, 0x46, 0x46]),     // WebP (RIFF)
    ],
  },
  document: {
    mimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'],
    magic: [
      Buffer.from([0x25, 0x50, 0x44, 0x46]),     // PDF (%PDF)
      Buffer.from([0xFF, 0xD8, 0xFF]),           // JPEG
      Buffer.from([0x89, 0x50, 0x4E, 0x47]),     // PNG
      Buffer.from([0x49, 0x49, 0x2A, 0x00]),     // TIFF (little-endian)
      Buffer.from([0x4D, 0x4D, 0x00, 0x2A]),     // TIFF (big-endian)
    ],
  },
};

// Dangerous file extensions that should NEVER be allowed
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.vbs',
  '.js', '.jsx', '.ts', '.tsx', '.sh', '.bash', '.ps1', '.psm1',
  '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl',
  '.dll', '.so', '.dylib', '.bin', '.elf',
  '.html', '.htm', '.svg', '.xml', '.xhtml',
];

export interface FileValidationOptions {
  /** Maximum file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Allowed categories: 'image' | 'document' | 'any' */
  category?: 'image' | 'document' | 'any';
}

@Injectable()
export class FileUploadValidator {
  /**
   * Validates an uploaded file for security.
   * Throws BadRequestException if validation fails.
   */
  validate(
    file: Express.Multer.File,
    options: FileValidationOptions = {},
  ): void {
    const { maxSize = 10 * 1024 * 1024, category = 'document' } = options;

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // 1. Size check
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`,
      );
    }

    // 2. Extension blocklist
    const ext = this.getExtension(file.originalname);
    if (BLOCKED_EXTENSIONS.includes(ext.toLowerCase())) {
      throw new BadRequestException(
        `File type '${ext}' is not allowed for security reasons`,
      );
    }

    // 3. MIME type validation
    if (category !== 'any') {
      const allowed = ALLOWED_TYPES[category];
      if (allowed && !allowed.mimes.includes(file.mimetype)) {
        throw new BadRequestException(
          `File type '${file.mimetype}' is not allowed. Accepted: ${allowed.mimes.join(', ')}`,
        );
      }
    }

    // 4. Magic bytes verification (content-based — can't be spoofed)
    if (category !== 'any' && file.buffer && file.buffer.length >= 4) {
      const allowed = ALLOWED_TYPES[category];
      if (allowed?.magic) {
        const matchesMagic = allowed.magic.some(magic =>
          file.buffer.slice(0, magic.length).equals(magic),
        );
        if (!matchesMagic) {
          throw new BadRequestException(
            'File content does not match its declared type. Upload rejected for security.',
          );
        }
      }
    }

    // 5. Filename sanitisation check (prevent path traversal)
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }
  }

  private getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  }
}

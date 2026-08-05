import {
  Controller, Post, UseInterceptors, UploadedFile, UploadedFiles,
  BadRequestException, Req, Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../storage/storage.service';
import { FileUploadValidator } from '../common/guards/file-upload.guard';

/**
 * Generic file upload controller — handles all document/image uploads to Cloudflare R2.
 *
 * Usage:
 *   POST /uploads?category=pod       → POD photos, signatures
 *   POST /uploads?category=document  → Waybill scans, invoices, customs docs
 *   POST /uploads?category=image     → Logos, general images
 *   POST /uploads/bulk               → Up to 5 files at once
 *
 * Returns: { key, url, filename, size, mimeType }
 */
@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  private readonly validator = new FileUploadValidator();

  constructor(private readonly storage: StorageService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a single file to R2' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Query('category') category?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const validCategory = (category === 'image' || category === 'document') ? category : 'document';
    this.validator.validate(file, { category: validCategory, maxSize: 20 * 1024 * 1024 });

    const companyId = req.user?.companyId || 'global';
    const prefix = this.resolvePrefix(category);
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
    const key = `${prefix}/${companyId}/${uuid()}.${ext}`;

    await this.storage.upload(key, file.buffer, file.mimetype);
    const url = this.storage.publicFileUrl(key);

    return {
      key,
      url,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Upload up to 5 files at once' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadBulk(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
    @Query('category') category?: string,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('No files provided');

    const validCategory = (category === 'image' || category === 'document') ? category : 'document';
    const companyId = req.user?.companyId || 'global';
    const prefix = this.resolvePrefix(category);

    const results = await Promise.all(
      files.map(async (file) => {
        this.validator.validate(file, { category: validCategory, maxSize: 20 * 1024 * 1024 });
        const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
        const key = `${prefix}/${companyId}/${uuid()}.${ext}`;
        await this.storage.upload(key, file.buffer, file.mimetype);
        return {
          key,
          url: this.storage.publicFileUrl(key),
          filename: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
        };
      }),
    );

    return { files: results };
  }

  @Post('presign')
  @ApiOperation({ summary: 'Get a pre-signed upload URL (for large files — client uploads directly to R2)' })
  async getPresignedUrl(
    @Req() req: any,
    @Query('filename') filename: string,
    @Query('contentType') contentType: string,
    @Query('category') category?: string,
  ) {
    if (!filename || !contentType) {
      throw new BadRequestException('filename and contentType query params required');
    }

    const companyId = req.user?.companyId || 'global';
    const prefix = this.resolvePrefix(category);
    const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
    const key = `${prefix}/${companyId}/${uuid()}.${ext}`;

    const uploadUrl = await this.storage.getSignedUploadUrl(key, contentType, 900);
    const publicUrl = this.storage.publicFileUrl(key);

    return { key, uploadUrl, publicUrl, expiresInSeconds: 900 };
  }

  private resolvePrefix(category?: string): string {
    switch (category) {
      case 'pod': return 'pod/photos';
      case 'signature': return 'pod/signatures';
      case 'document': return 'documents';
      case 'waybill': return 'waybills/scans';
      case 'customs': return 'customs';
      case 'image': return 'images';
      default: return 'uploads';
    }
  }
}

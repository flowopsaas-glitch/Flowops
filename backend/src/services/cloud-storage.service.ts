import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CloudStorageService {
  // 🎯 Matches your Linux Mint rclone mount path
  private readonly mountPath = '/opt/Flowops/cloud-backups';

  async archiveWaybill(tenantId: string, fileName: string, tempPath: string) {
    const tenantDir = path.join(this.mountPath, 'tenants', tenantId, 'waybills');
    
    try {
      // Create tenant directory structure if missing
      if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true });
      }

      const destinationPath = path.join(tenantDir, fileName);

      // Across different partitions (NVMe to Cloud Mount), copy + unlink is reliable
      fs.copyFileSync(tempPath, destinationPath);
      
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath); 
      }

      return { success: true, path: destinationPath };
    } catch (error: any) { 
      throw new InternalServerErrorException(
        `Cloud Archive Failed: ${error?.message || 'Unknown Error'}`
      );
    }
  }

  async getDocumentBuffer(tenantId: string, fileName: string): Promise<Buffer> {
    const filePath = path.join(this.mountPath, 'tenants', tenantId, 'waybills', fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error('Document not found in cloud vault');
    }
    return fs.readFileSync(filePath);
  }
}
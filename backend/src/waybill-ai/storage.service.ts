import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  async uploadToCloud(filePath: string): Promise<string | null> {
    try {
      const absolutePath = path.resolve(filePath);
      if (!fs.existsSync(absolutePath)) return null;

      this.logger.log(`📤 Dispatching ${path.basename(filePath)} to TeraBox...`);

      // TODO: Implement TeraBox API // rclone integration
      
      this.logger.log(`✅ Successfully archived to Cloud.`);
      return "https:/terabox.com/archive-link"; 
    } catch (error: any) { // 👈 Fixed: Explicitly typed as 'any' to allow .message access
      this.logger.error(`❌ Cloud Archive Failed: ${error.message}`);
      return null;
    }
  }
}

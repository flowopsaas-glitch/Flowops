import { Injectable } from "@nestjs/common";
import * as path from "path";
import * as fs from "fs/promises";

@Injectable()
export class StorageService {
  private baseDir(): string {
    return path.resolve(process.cwd(), "uploads", "waybills");
  }

  async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir(), { recursive: true });
  }

  async saveFile(buffer: Buffer, originalName: string): Promise<{ storagePath: string }> {
    await this.ensureBaseDir();

    const safeName = (originalName || "upload").replace(/[^\w.\-]+/g, "_");
    const stamp = Date.now();
    const filename = `${stamp}_${safeName}`;

    const fullPath = path.join(this.baseDir(), filename);
    await fs.writeFile(fullPath, buffer);

    const rel = path.relative(process.cwd(), fullPath);
    return { storagePath: rel };
  }
}
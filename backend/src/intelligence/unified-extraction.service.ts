import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import axios from 'axios';
import sharp from 'sharp';

export enum ExtractionModel {
  MOONDREAM = 'moondream',
  LLAVA = 'llava',
}

export interface ExtractionResult {
  waybillNumber?: string;
  recipient?: string;
  address?: string;
  weight?: number | string;
  pieces?: number | string;
  confidence?: number;
  sender?: string;
  [key: string]: any;
}

export interface ExtractionTelemetry {
  model: ExtractionModel;
  processingTimeMs: number;
  confidence: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class UnifiedExtractionService {
  private readonly logger = new Logger('UnifiedExtractionService');
  // 🚀 FIXED: Corrected URL protocol
  private readonly ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
  private telemetryBuffer: ExtractionTelemetry[] = [];

  async extractWaybillData(filePath: string, model: ExtractionModel = ExtractionModel.MOONDREAM): Promise<ExtractionResult> {
    const startTime = Date.now();
    const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    const absolutePath = join(process.cwd(), cleanPath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Asset missing: ${absolutePath}`);
    }

    try {
      const optimizedBuffer = await sharp(absolutePath)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const imageBase64 = optimizedBuffer.toString('base64');
      let result: ExtractionResult;

      if (model === ExtractionModel.MOONDREAM) {
        result = await this.extractWithMoondream(imageBase64);
      } else if (model === ExtractionModel.LLAVA) {
        result = await this.extractWithLlava(imageBase64);
      } else {
        throw new Error(`Unknown extraction model: ${model}`);
      }

      const processingTime = Date.now() - startTime;
      this.recordTelemetry({
        model,
        processingTimeMs: processingTime,
        confidence: result.confidence || 0,
        success: true,
      });

      this.logger.log(`✅ [${model}] Extraction complete. Confidence: ${((result.confidence || 0) * 100).toFixed(1)}%. Time: ${processingTime}ms`);
      return result;
    } catch (err: any) {
      const processingTime = Date.now() - startTime;
      this.recordTelemetry({
        model,
        processingTimeMs: processingTime,
        confidence: 0,
        success: false,
        error: err.message,
      });

      this.logger.error(`❌ [${model}] Extraction failed: ${err.message}`);
      throw err;
    }
  }

  private async extractWithMoondream(imageBase64: string): Promise<ExtractionResult> {
    const response = await axios.post(this.ollamaUrl, {
      model: ExtractionModel.MOONDREAM,
      prompt: `Analyze waybill. Extract JSON: waybillNumber, recipient, address, weight, pieces, confidence.`,
      stream: false,
      format: 'json',
      images: [imageBase64],
    });
    return JSON.parse(response.data.response);
  }

  private async extractWithLlava(imageBase64: string): Promise<ExtractionResult> {
    const response = await axios.post(this.ollamaUrl, {
      model: ExtractionModel.LLAVA,
      prompt: 'Logistics extraction: Return ONLY JSON with "waybillNumber" and "sender".',
      images: [imageBase64],
      stream: false,
      format: 'json',
    });
    const data = JSON.parse(response.data.response);
    return {
      waybillNumber: data.waybillNumber,
      sender: data.sender,
      confidence: 0.85,
    };
  }

  getTelemetry(): ExtractionTelemetry[] {
    return [...this.telemetryBuffer];
  }

  /**
   * 🚀 THE CRITICAL FIX:
   * Restored the division operators (/) so they aren't treated as comments.
   */
  getTelemetryStats(model?: ExtractionModel) {
    const filtered = model ? this.telemetryBuffer.filter(t => t.model === model) : this.telemetryBuffer;
    if (filtered.length === 0) return null;

    const avgTime = filtered.reduce((sum, t) => sum + t.processingTimeMs, 0) / filtered.length;
    const avgConfidence = filtered.reduce((sum, t) => sum + t.confidence, 0) / filtered.length;
    const successRate = (filtered.filter(t => t.success).length / filtered.length) * 100;

    return {
      model,
      count: filtered.length,
      avgProcessingTimeMs: Math.round(avgTime),
      avgConfidence: parseFloat(avgConfidence.toFixed(3)),
      successRate: parseFloat(successRate.toFixed(1)),
    };
  }

  clearTelemetry(): void {
    this.telemetryBuffer = [];
  }

  private recordTelemetry(telemetry: ExtractionTelemetry): void {
    this.telemetryBuffer.push(telemetry);
    if (this.telemetryBuffer.length > 1000) {
      this.telemetryBuffer = this.telemetryBuffer.slice(-1000);
    }
  }
}

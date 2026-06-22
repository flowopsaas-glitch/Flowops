import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClawLogicEngine {
  private readonly logger = new Logger(ClawLogicEngine.name);
  private readonly aggressionLevel: string;

  constructor(private readonly configService: ConfigService) {
    this.aggressionLevel = this.configService.get('CLAW_AGGRESSION_LEVEL', 'MEDIUM');
  }

  /**
   * Evaluates if an anomaly can be auto-repaired based on CLAW_AGGRESSION_LEVEL.
   */
  shouldAutoRepair(confidenceScore: number): boolean {
    if (this.aggressionLevel === 'HIGH') return confidenceScore > 0.6;
    return confidenceScore > 0.85;
  }

  /**
   * Applies 'Golden Patterns' learned from previous human corrections.
   * Safely escapes input strings to prevent RegExp runtime exceptions or ReDoS compilation drops.
   */
  applyLearnedPatterns(rawData: string, patterns: any[]): string {
    if (!rawData) return '';
    if (!patterns || !Array.isArray(patterns)) return rawData;

    let refinedData = rawData;

    for (const pattern of patterns) {
      try {
        if (!pattern || typeof pattern.oldValue !== 'string' || typeof pattern.newValue !== 'string') {
          this.logger.warn(`⚠️ Skipping invalid pattern payload entry layout mismatch: ${JSON.stringify(pattern)}`);
          continue;
        }

        // Escape regular expression special characters to keep the runtime parser secure
        const safelyEscapedOldValue = pattern.oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safelyEscapedOldValue, 'g');
        
        refinedData = refinedData.replace(regex, pattern.newValue);
      } catch (loopError: unknown) {
        const errorMsg = loopError instanceof Error ? loopError.message : 'Unknown pattern manipulation exception';
        this.logger.error(`❌ Failed compiling patterns map iteration layer sequence step: ${errorMsg}`);
      }
    }

    return refinedData;
  }
}


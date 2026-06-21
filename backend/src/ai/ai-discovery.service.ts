import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';

@Injectable()
export class AiDiscoveryService {
  private readonly logger = new Logger(AiDiscoveryService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService
  ) {}

  /** Security Audit: Processes scanner results from Semgrep/Trivy */
  async analyzeSecurityThreats(source: string, results: any[]) {
    this.logger.warn(`Security Analysis: Processing ${results.length} findings from ${source}`);
    return results.filter(r => r.extra?.severity === 'ERROR' || r.Severity === 'CRITICAL');
  }

  /** 
   * Logistics HUD: Extracts data from raw email bodies.
   * Fixed to ensure dynamic extraction of reference numbers and addresses.
   */
  async extractLogisticsData(text: string) {
    this.logger.log('Logistics Extraction: Parsing email body for real-time data...');

    const prompt = `
      Extract logistics details from the text provided below. 
      Text: "${text}"

      CRITICAL: Extract the actual reference number mentioned in the text (e.g., MATCH-202). 
      Do not use placeholder values like JD-991 unless explicitly stated in the text.

      IMPORTANT: You must return ONLY a JSON object. Do not include conversational text.
      The JSON must contain these exact keys: 
      { 
        "pickupAddress": string, 
        "closingTime": string, 
        "pallets": number, 
        "referenceNumber": string, 
        "receiverCity": string 
      }
    `;

    try {
      // Use the internal AI tool to generate the response
      const response = await (this.ai as any).generateAIResponse(prompt);
      
      // Extraction logic to handle AI-generated markdown blocks or raw strings
      const cleanJson = this.parseAIJsonResponse(response);

      if (!cleanJson || !cleanJson.referenceNumber) {
        throw new Error('Incomplete extraction results: Missing referenceNumber');
      }

      this.logger.log(`Extraction Success: Found ref ${cleanJson.referenceNumber}`);
      return cleanJson;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to extract logistics data: ${errorMessage}`);
      
      // Return a null-safe fallback to prevent service crashes
      return {
        pickupAddress: 'Unknown',
        closingTime: 'Unknown',
        pallets: 0,
        referenceNumber: 'ERROR-PARSING',
        receiverCity: 'Unknown'
      };
    }
  }

  /**
   * Helper to strip Markdown and parse JSON reliably.
   */
  private parseAIJsonResponse(response: any): any {
    if (typeof response !== 'string') return response;
    
    try {
      // Look for JSON block patterns first
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch (e) {
      this.logger.error('JSON Parse Error: ' + response);
      return null;
    }
  }

  /** 
   * Anomaly Engine: Compares extracted data against system records.
   */
  async analyzeTableAnomalies(modelName: string, data: any[]) {
    this.logger.log(`Analysis: Interpreting anomalies in ${modelName}...`);
    const prompt = `
      Compare these records from the ${modelName} table: ${JSON.stringify(data.slice(0, 5))}
      Return ONLY a valid JSON object: 
      { "actionRequired": boolean, "reason": string, "suggestedFix": { "where": object, "data": object } }
    `;

    try {
      const response = await (this.ai as any).generateAIResponse(prompt);
      return this.parseAIJsonResponse(response);
    } catch (error) {
      return { actionRequired: false, reason: "Analysis failed", suggestedFix: null };
    }
  }

  /** 
   * Operations Pattern Recognition: Identifies density for Ghost Dispatching.
   */
  async learnOperations(companyId: number) {
    this.logger.log(`Discovery: Analyzing patterns for company ${companyId}`);
    
    // Aggregates waybill data to find delivery clusters
    const clusters = await (this.prisma.waybill.groupBy({
      by: ['receiverCity'] as any, 
      where: { companyId },
      _count: { id: true },
      having: { id: { _count: { gt: 10 } } }
    }) as any);

    if (clusters && clusters.length > 0) {
      return { 
        insight: 'Detected high delivery density.', 
        action: 'Ghost Dispatching recommended.', 
        upgradeAvailable: true 
      };
    }
    return { insight: 'Standard operations detected.', upgradeAvailable: false };
  }
}

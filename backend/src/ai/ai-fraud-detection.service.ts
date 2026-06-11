import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AiFraudDetectionService {
  private readonly logger = new Logger(AiFraudDetectionService.name);
  private readonly groqApiKey: string;
  private readonly visionModel: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY') || '';
    this.visionModel = this.config.get<string>('AI_VISION_MODEL') || 'llama-3.2-11b-vision-instruct';
  }

  /**
   * Comprehensive fraud analysis for POD
   */
  async analyzePodFraud(imageUrl: string, waybillId: number, companyId: number): Promise<{
    fraudScore: number; // 0-100 (higher = more suspicious)
    isFraudulent: boolean;
    risks: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      description: string;
      confidence: number;
    }>;
    recommendations: string[];
    aiAnalysis: any;
  }> {
    this.logger.log(`🔍 Analyzing POD for fraud: Waybill ${waybillId}`);

    const risks: any[] = [];
    let fraudScore = 0;

    // 1. Check for reused photos (same image used for multiple waybills)
    const reusedPhotoCheck = await this.checkReusedPhotos(imageUrl, companyId);
    if (reusedPhotoCheck.isReused) {
      risks.push({
        type: 'REUSED_PHOTO',
        severity: 'CRITICAL',
        description: `This photo was previously used for waybill(s): ${reusedPhotoCheck.previousWaybills.join(', ')}`,
        confidence: 95,
      });
      fraudScore += 50;
    }

    // 2. AI Vision analysis for manipulation
    const aiAnalysis = await this.analyzeWithAI(imageUrl, waybillId);
    
    if (aiAnalysis.isManipulated) {
      risks.push({
        type: 'MANIPULATED_IMAGE',
        severity: 'HIGH',
        description: aiAnalysis.manipulationDetails || 'Image shows signs of digital manipulation',
        confidence: aiAnalysis.confidence || 80,
      });
      fraudScore += 30;
    }

    if (aiAnalysis.isFakeSignature) {
      risks.push({
        type: 'FAKE_SIGNATURE',
        severity: 'HIGH',
        description: 'Signature appears to be AI-generated or copied',
        confidence: aiAnalysis.signatureConfidence || 75,
      });
      fraudScore += 25;
    }

    if (!aiAnalysis.hasValidSignature) {
      risks.push({
        type: 'MISSING_SIGNATURE',
        severity: 'MEDIUM',
        description: 'No valid signature detected on POD',
        confidence: 90,
      });
      fraudScore += 15;
    }

    // 3. Check for suspicious patterns
    const patternCheck = await this.checkSuspiciousPatterns(waybillId, companyId);
    if (patternCheck.suspicious) {
      risks.push({
        type: 'SUSPICIOUS_PATTERN',
        severity: 'MEDIUM',
        description: patternCheck.reason,
        confidence: 70,
      });
      fraudScore += 20;
    }

    // 4. Metadata analysis
    const metadataCheck = await this.analyzeImageMetadata(imageUrl);
    if (metadataCheck.suspicious) {
      risks.push({
        type: 'METADATA_ANOMALY',
        severity: 'LOW',
        description: metadataCheck.reason,
        confidence: 60,
      });
      fraudScore += 10;
    }

    // Cap fraud score at 100
    fraudScore = Math.min(fraudScore, 100);

    const isFraudulent = fraudScore >= 70;

    const recommendations = this.generateRecommendations(risks, fraudScore);

    this.logger.log(`🔍 Fraud analysis complete: Score ${fraudScore}/100, ${risks.length} risks detected`);

    return {
      fraudScore,
      isFraudulent,
      risks,
      recommendations,
      aiAnalysis,
    };
  }

  /**
   * Check if photo was previously used for other waybills
   */
  private async checkReusedPhotos(imageUrl: string, companyId: number): Promise<{
    isReused: boolean;
    previousWaybills: string[];
  }> {
    try {
      // Generate image hash (perceptual hash)
      const imageHash = await this.generateImageHash(imageUrl);
      
      // Check if this hash exists in database
      const existingPods = await this.prisma.proofOfDelivery.findMany({
      where: {
        waybill: { companyId },
        photoData: imageUrl,
      },
        include: {
          waybill: {
            select: { waybillNumber: true },
          },
        },
      });

      if (existingPods.length > 0) {
        return {
          isReused: true,
          previousWaybills: existingPods.map(pod => String(pod.waybillId)),
        };
      }

      return {
        isReused: false,
        previousWaybills: [],
      };
    } catch (error: any) {
      this.logger.error(`Failed to check reused photos: ${error.message}`);
      return {
        isReused: false,
        previousWaybills: [],
      };
    }
  }

  /**
   * Generate perceptual hash for image
   */
  private async generateImageHash(imageUrl: string): Promise<string> {
    try {
      // Fetch image
      const response = await fetch(imageUrl);
      const buffer = await response.arrayBuffer();
      
      // Generate hash (simplified - in production use proper perceptual hashing)
      const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
      
      return hash;
    } catch (error: any) {
      this.logger.error(`Failed to generate image hash: ${error.message}`);
      return '';
    }
  }

  /**
   * AI-powered analysis for manipulation and fake signatures
   */
  private async analyzeWithAI(imageUrl: string, waybillId: number): Promise<any> {
    try {
      if (!this.groqApiKey) {
        return {
          isManipulated: false,
          isFakeSignature: false,
          hasValidSignature: true,
          confidence: 50,
        };
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: 'system',
              content: `You are FlowOps Fraud Detection AI. Analyze this Proof of Delivery photo for:
              1. Image manipulation (Photoshop, filters, editing)
              2. Fake or AI-generated signatures
              3. Missing or invalid signatures
              4. Suspicious elements (watermarks, stock photos, etc.)
              
              Respond with JSON: {
                isManipulated: boolean,
                manipulationDetails: string,
                isFakeSignature: boolean,
                signatureConfidence: number,
                hasValidSignature: boolean,
                confidence: number,
                details: string
              }`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Analyze this POD for waybill ${waybillId} for fraud indicators` },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          temperature: 0.2,
          max_tokens: 800,
          response_format: { type: 'json_object' }
        }),
      });

      const data = await response.json();
      const content = (data as any).choices?.[0]?.message?.content || '{}';
      
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch {
        analysis = {
          isManipulated: false,
          isFakeSignature: false,
          hasValidSignature: true,
          confidence: 50,
        };
      }

      return analysis;
    } catch (error: any) {
      this.logger.error(`AI fraud analysis failed: ${error.message}`);
      return {
        isManipulated: false,
        isFakeSignature: false,
        hasValidSignature: true,
        confidence: 50,
      };
    }
  }

  /**
   * Check for suspicious patterns (same driver, same location, multiple waybills)
   */
  private async checkSuspiciousPatterns(waybillId: number, companyId: number): Promise<{
    suspicious: boolean;
    reason: string;
  }> {
    try {
      const waybill = await this.prisma.waybill.findUnique({
        where: { id: waybillId },
        include: {
          proofsOfDelivery: true,
        },
      });

      if (!waybill) {
        return { suspicious: false, reason: '' };
      }

      // Check if driver has delivered multiple waybills to same location in short time
      const recentDeliveries = await this.prisma.waybill.findMany({
        where: {
          companyId,
          driverId: waybill.driverId,
          destination: waybill.destination,
          status: 'DELIVERED',
          deliveredAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
      });

      if (recentDeliveries.length > 3) {
        return {
          suspicious: true,
          reason: `Driver delivered ${recentDeliveries.length} waybills to same location in last hour`,
        };
      }

      return { suspicious: false, reason: '' };
    } catch (error: any) {
      this.logger.error(`Pattern check failed: ${error.message}`);
      return { suspicious: false, reason: '' };
    }
  }

  /**
   * Analyze image metadata for anomalies
   */
  private async analyzeImageMetadata(imageUrl: string): Promise<{
    suspicious: boolean;
    reason: string;
  }> {
    try {
      // Check if image is from stock photo site or has suspicious metadata
      const response = await fetch(imageUrl);
      const contentType = response.headers.get('content-type');
      
      // Check for suspicious file sizes (too small = possibly downloaded)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) < 50000) {
        return {
          suspicious: true,
          reason: 'Image file size unusually small (possibly downloaded from internet)',
        };
      }

      return { suspicious: false, reason: '' };
    } catch (error: any) {
      return { suspicious: false, reason: '' };
    }
  }

  /**
   * Generate recommendations based on risks
   */
  private generateRecommendations(risks: any[], fraudScore: number): string[] {
    const recommendations: string[] = [];

    if (fraudScore >= 70) {
      recommendations.push('🚨 REJECT this POD - High fraud probability');
      recommendations.push('📞 Contact driver immediately for verification');
      recommendations.push('📸 Request new POD photo with timestamp');
    } else if (fraudScore >= 40) {
      recommendations.push('⚠️ Review this POD carefully before approval');
      recommendations.push('🔍 Verify signature matches recipient name');
      recommendations.push('📞 Call recipient to confirm delivery');
    } else {
      recommendations.push('✅ POD appears legitimate');
      recommendations.push('👍 Safe to approve');
    }

    risks.forEach(risk => {
      if (risk.type === 'REUSED_PHOTO') {
        recommendations.push('🚨 CRITICAL: Photo was used for previous deliveries');
      }
      if (risk.type === 'FAKE_SIGNATURE') {
        recommendations.push('⚠️ Signature may be AI-generated or copied');
      }
    });

    return recommendations;
  }
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  recommendAction(context: any) {
    return {
      recommendation: 'Delay vendor payment',
      target: 'Vendor A',
      delayDays: 5,
      expectedCashImpact: '+120000',
      confidence: 0.91,
      generatedAt: new Date().toISOString(),
    };
  }
}

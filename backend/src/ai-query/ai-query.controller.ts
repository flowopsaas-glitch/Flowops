import { Controller, Post, Body, UseGuards, Request, Get, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiQueryService } from './ai-query.service';

@UseGuards(JwtAuthGuard)
@Controller('ai-query')
export class AiQueryController {
  constructor(private readonly aiQueryService: AiQueryService) {}

  @Post('analyze')
  async analyzeQuery(
    @Request() req: any,
    @Body('query') query: string,
    @Body('language') language: string = 'en',
  ) {
    const companyId = req.user?.companyId || 1;
    return this.aiQueryService.analyzeQuery(query, companyId, language);
  }

  @Get('suggestions')
  async getSuggestedQueries(@Query('language') language: string = 'en') {
    const suggestions: Record<string, string[]> = {
      en: [
        'Why were deliveries late yesterday?',
        'What will revenue be next month?',
        'When should we hire more drivers?',
        'Which routes will be busiest next week?',
        'How can we improve our success rate?',
        'Show me peak delivery days',
        'Which destinations are growing fastest?',
      ],
      af: [
        'Hoekom was aflewerings gister laat?',
        'Wat sal die inkomste volgende maand wees?',
        'Wanneer moet ons meer bestuurders huur?',
        'Watter roetes sal volgende week besig wees?',
        'Hoe kan ons ons sukseskoers verbeter?',
      ],
      zu: [
        'Kungani ukulethwa kwase izolo kufikile sekwephuzile?',
        'Izoba yimalini imali engenayo ngenyanga ezayo?',
        'Kufanele siqase nini abashayeli abaningi?',
        'Yimaphi amasu azoba matasa ngesonto elizayo?',
        'Singayithuthukisa kanjani izinga lethu lempumelelo?',
      ],
      xh: [
        'Kutheni ukuhanjiswa kwe izolo kube kude?',
        'Iza kuba yimalini ingeniso kwinyanga ezayo?',
        'Kufuneka siqeshe nini abaqhubi abaninzi?',
        'Zeziphi iindlela eziya kuxakeka kwiveki ezayo?',
        'Singayiphucula njani impumelelo yethu?',
      ],
    };

    return {
      suggestions: suggestions[language] || suggestions.en,
      language,
    };
  }

  @Get('languages')
  async getSupportedLanguages() {
    return {
      languages: this.aiQueryService.getSupportedLanguages(),
    };
  }
}

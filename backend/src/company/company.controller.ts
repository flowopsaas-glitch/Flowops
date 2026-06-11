import { Controller, Patch, Body, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('company')
export class CompanyController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch(':id')
  async updateCompany(@Param('id') id: string, @Body() body: any) {
    return (this.prisma as any).company.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        // Remove slaWarningMinutes or other unknown fields
      },
    });
  }
}

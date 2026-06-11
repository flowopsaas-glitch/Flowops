import { Controller, Get, Param } from '@nestjs/common';

@Controller('booking-portal')
export class BookingPortalController {
  @Get('companies/:id/links')
  async getCompanyLinks(@Param('id') id: string) {
    // Returning an empty array for now so the frontend can render the table
    return [];
  }
}

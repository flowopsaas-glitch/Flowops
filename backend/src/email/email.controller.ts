import { Controller, Get } from '@nestjs/common';

@Controller('emails')
export class EmailController {
  @Get()
  async getEmails() {
    return []; // Return empty list instead of 404
  }
}

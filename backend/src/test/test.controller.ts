import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('test')
export class TestController {
  @UseGuards(JwtAuthGuard)
  @Get('protected')
  getProtected(@Req() req: any) {
    return {
      message: 'You are authenticated',
      user: req.user,
    }
  }
}

import { Controller, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Controller('dev-auth')
export class DevLoginController {
  constructor(private readonly jwtService: JwtService) {}

  @Post('login')
  devLogin() {
    // WARNING: ONLY FOR DEV // LOCAL TESTING
    const payload = { sub: 'dev-user', role: 'admin' };
    const token = this.jwtService.sign(payload, { expiresIn: '1h' });
    return { access_token: token };
  }
}

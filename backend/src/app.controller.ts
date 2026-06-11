import { Controller, Get, Res, Req } from '@nestjs/common';
import { join } from 'path';
import { Response, Request } from 'express';

@Controller()
export class AppController {
  // Serve frontend index.html for all non-API routes
  @Get('*')
  serveFrontend(@Req() req: Request, @Res() res: Response) {
    if (!req.path.startsWith('/api')) {
      return res.sendFile(join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    }
    res.status(404).json({ message: 'Not Found' });
  }
}

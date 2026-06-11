import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';

@Global() // Makes MailService available everywhere without re-importing in every module
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

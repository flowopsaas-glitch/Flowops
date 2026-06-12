import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/** Global — EmailService is available in every module without re-importing. */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

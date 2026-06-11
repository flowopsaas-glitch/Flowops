import { Controller, Patch, Param } from '@nestjs/common';
import { AckService } from './ack.service';
import { Collection } from '@prisma/client';

@Controller('acks')
export class AckController {
  constructor(private readonly service: AckService) {}

  @Patch(':id')
  acknowledge(@Param('id') id: string): Promise<Collection> {
    return this.service.acknowledgeCollection(id);
  }
}

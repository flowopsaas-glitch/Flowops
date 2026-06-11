import { Controller, Post } from '@nestjs/common';
import { CourierBootstrapService } from './courier-bootstrap.service';

@Controller('internal/courier-bootstrap')
export class CourierBootstrapController {
  constructor(private service: CourierBootstrapService) {}

  @Post()
  bootstrap() {
    return this.service.bootstrap();
  }
}

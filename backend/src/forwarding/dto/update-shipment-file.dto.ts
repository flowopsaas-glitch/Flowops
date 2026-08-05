import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ShipmentFileStatus } from '@prisma/client';
import { CreateShipmentFileDto } from './create-shipment-file.dto';

export class UpdateShipmentFileDto extends PartialType(CreateShipmentFileDto) {
  @IsOptional()
  @IsEnum(ShipmentFileStatus)
  status?: ShipmentFileStatus;
}

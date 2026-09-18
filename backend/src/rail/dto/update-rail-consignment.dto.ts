import { PartialType } from '@nestjs/swagger';
import { CreateRailConsignmentDto } from './create-rail-consignment.dto';

export class UpdateRailConsignmentDto extends PartialType(CreateRailConsignmentDto) {}

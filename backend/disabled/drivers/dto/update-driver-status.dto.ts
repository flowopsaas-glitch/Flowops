import { IsEnum, IsString } from 'class-validator';
import { DriverStatus } from '../../common/enums';

export class UpdateDriverStatusDto {
  @IsString()
  driverId!: string;  // '!' tells TypeScript this will be assigned

  @IsEnum(DriverStatus)
  status!: DriverStatus; // '!' ensures TS knows this will be assigned
}

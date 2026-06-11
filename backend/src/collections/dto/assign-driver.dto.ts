import { IsInt, IsOptional, Min } from 'class-validator';

export class AssignDriverDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  driverId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedByUserId?: number;
}
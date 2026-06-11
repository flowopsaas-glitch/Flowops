import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class AssignDispatchJobDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  driverId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assignedByUserId?: number;
}

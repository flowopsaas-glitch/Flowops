import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Transform } from "class-transformer";

export class ShipmentsCopilotDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @Transform(({ value }) => (value === "true" || value === true ? true : value === "false" || value === false ? false : value))
  @IsBoolean()
  onlyStuck?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(1440)
  stuckMins?: number;

  @IsOptional()
  @Transform(({ value }) => String(value))
  @IsString()
  q?: string;
}

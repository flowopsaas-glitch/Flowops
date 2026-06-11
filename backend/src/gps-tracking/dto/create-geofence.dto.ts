import { IsString, IsOptional, IsNumber, IsIn, IsArray, Min, Max } from 'class-validator';

export class CreateGeofenceDto {
  @IsString()
  name: string;

  @IsString()
  @IsIn(['CIRCLE', 'POLYGON'])
  type: 'CIRCLE' | 'POLYGON';

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  radius?: number;

  @IsOptional()
  @IsArray()
  polygon?: number[][];
}

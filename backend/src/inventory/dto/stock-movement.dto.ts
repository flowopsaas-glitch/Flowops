import { IsString, IsOptional, IsInt, IsIn, Min } from 'class-validator';

export class StockMovementDto {
  @IsInt()
  itemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsIn(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'])
  type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN';

  @IsOptional()
  @IsInt()
  fromLocationId?: number;

  @IsOptional()
  @IsInt()
  toLocationId?: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;
}

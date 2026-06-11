import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsInt()
  @Min(1)
  companyId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  clientId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  courierId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  createdById?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  driverId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  collectionAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  collectionContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  collectionContactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  collectionContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  closingTime?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  deliveryContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  deliveryContactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  deliveryContactPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  parcelCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  palletCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  contractCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number;

  @IsOptional()
  @IsString()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
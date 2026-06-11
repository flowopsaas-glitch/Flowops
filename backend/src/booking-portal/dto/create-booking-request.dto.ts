import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum BookingRequestTypeDto {
  QUOTE = 'QUOTE',
  BOOKING = 'BOOKING',
  COLLECTION = 'COLLECTION',
}

export class CreateBookingRequestDto {
  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsEnum(BookingRequestTypeDto)
  requestType!: BookingRequestTypeDto;

  @IsString()
  @MaxLength(120)
  requesterName!: string;

  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  collectionAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  @IsOptional()
  @IsDateString()
  collectionDate?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  parcelCount?: number;

  @IsOptional()
  @IsNumber()
  totalWeightKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serviceLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payerSide?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  uploadedDocUrl?: string;
}
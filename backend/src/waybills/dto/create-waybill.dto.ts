import { IsString, IsNumber, IsOptional, IsArray, IsEnum } from 'class-validator';

export class CreateWaybillDto {
  @IsString()
  @IsOptional()
  waybillNumber?: string;

  @IsNumber()
  companyId: number;

  @IsString()
  @IsOptional()
  status?: string;

  // --- Financials ---
  @IsNumber()
  @IsOptional()
  totalAmount?: number;

  @IsString()
  @IsOptional()
  paymentType?: string; // e.g., 'CONTRACT', 'COD'

  @IsString()
  @IsOptional()
  payer?: string; // 'SENDER' or 'RECIPIENT'

  @IsString()
  @IsOptional()
  contractId?: string;

  // --- Physical Audit ---
  @IsNumber()
  @IsOptional()
  weightKg?: number;

  @IsNumber()
  @IsOptional()
  quantity?: number; // 🚀 Fixed: Added parcel count

  @IsNumber()
  @IsOptional()
  distanceKm?: number;

  @IsString()
  @IsOptional()
  imageUrl?: string; // Link to the original scan

  @IsArray()
  @IsOptional()
  parcelImages?: string[]; // Evidence for the Driver Hub

  // --- Chain of Custody: Origin (Sender) ---
  @IsString()
  @IsOptional()
  sender?: string; // Company Name

  @IsString()
  @IsOptional()
  senderAddress?: string;

  @IsString()
  @IsOptional()
  senderContact?: string;

  @IsString()
  @IsOptional()
  senderPhone?: string;

  // --- Chain of Custody: Destination (Recipient) ---
  @IsString()
  @IsOptional()
  recipient?: string; // Company Name

  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @IsString()
  @IsOptional()
  recipientContact?: string;

  @IsString()
  @IsOptional()
  recipientPhone?: string;
}

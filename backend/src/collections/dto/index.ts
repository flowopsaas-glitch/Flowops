// backend/src/collections/dto/index.ts
export class CreateCollectionDto {
  userId: string;
  companyName: string;
  address: string;
  contactPerson: string;
  parcels: { refNumber: string; description: string; weight?: number }[];
  closingTime: string; // ISO datetime
}

export class UpdateCollectionDto {
  companyName?: string;
  address?: string;
  contactPerson?: string;
  parcels?: { refNumber: string; description: string; weight?: number }[];
  closingTime?: string;
  status?: 'pending' | 'scheduled' | 'collected' | 'cancelled';
  driverId?: string;
}

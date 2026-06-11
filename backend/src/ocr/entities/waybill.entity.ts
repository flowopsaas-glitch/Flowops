export class WaybillEntity {
  id: number;
  waybillNumber: string;
  companyId: number;
  status: 'PENDING' | 'READY' | 'FAILED' | 'EXCEPTION';
  totalAmount: number;
  extractedData: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<WaybillEntity>) {
    Object.assign(this, partial);
  }
}

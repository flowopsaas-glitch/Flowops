export class UpdateCollectionDto {
  title?: string;
  description?: string;
  status?: 'PENDING' | 'APPROVED' | 'SCHEDULED';
  assignedTo?: string;
  companyId?: string;
}

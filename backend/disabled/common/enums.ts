export enum CollectionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  SCHEDULED = 'SCHEDULED',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  OPERATOR = 'OPERATOR',
  DRIVER = 'DRIVER',
}

export enum DriverStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export enum QuoteStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

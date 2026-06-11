// Manually mirror Prisma enums for TypeScript usage

export enum Role {
  ADMIN = 'ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  OPERATOR = 'OPERATOR',
  DRIVER = 'DRIVER',
}

export enum QuoteStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

export enum CollectionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  SCHEDULED = 'SCHEDULED',
}

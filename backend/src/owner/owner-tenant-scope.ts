export const PLATFORM_OWNER_COMPANY_NAMES = [
  'FLOWOPS',
  'FLOWOPS LTD',
  'FLOWOPS LIMITED',
  'FLOWOPS SAAS',
  'FLOW OPS',
];

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizeCompanyName(value: unknown): string {
  return normalizeText(value);
}

export function isPlatformOwnerCompanyRecord(company: any): boolean {
  if (!company) {
    return false;
  }

  const companyName = normalizeCompanyName(company.name);
  const portalBrandName = normalizeCompanyName(company.portalBrandName);
  const portalSubdomain = normalizeCompanyName(company.portalSubdomain);

  if (PLATFORM_OWNER_COMPANY_NAMES.includes(companyName)) {
    return true;
  }

  if (PLATFORM_OWNER_COMPANY_NAMES.includes(portalBrandName)) {
    return true;
  }

  if (portalSubdomain === 'FLOWOPS') {
    return true;
  }

  if (company.isPlatformOwner === true) {
    return true;
  }

  if (company.isOwnerPlatform === true) {
    return true;
  }

  if (company.platformRole === 'OWNER') {
    return true;
  }

  if (company.companyType === 'PLATFORM_OWNER') {
    return true;
  }

  if (company.tenantType === 'PLATFORM_OWNER') {
    return true;
  }

  return false;
}

export function isRealTenantCompanyRecord(company: any): boolean {
  return !!company && !isPlatformOwnerCompanyRecord(company);
}

export function filterRealTenantCompanies(companies: any[]): any[] {
  return (companies ?? []).filter((company) => isRealTenantCompanyRecord(company));
}

export function assertRealTenantCompanyRecord(company: any): any {
  if (!company || !isRealTenantCompanyRecord(company)) {
    throw new Error('REAL_TENANT_NOT_FOUND');
  }

  return company;
}

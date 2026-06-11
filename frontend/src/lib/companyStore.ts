export type CompanyInfo = {
  companyName: string;
  companyEmail: string;
  whatsappNumber: string;
  approved: boolean;
};

const STORAGE_KEY = "flowops_company";

export function saveCompanyInfo(data: CompanyInfo) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getCompanyInfo(): CompanyInfo | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isCompanyComplete(): boolean {
  const data = getCompanyInfo();
  if (!data) return false;

  return (
    data.companyName !== "" &&
    data.companyEmail !== "" &&
    data.whatsappNumber !== ""
  );
}

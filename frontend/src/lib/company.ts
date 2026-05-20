export function isCompanyConfigured(): boolean {
  return localStorage.getItem("companyConfigured") === "true";
}

export function markCompanyConfigured() {
  localStorage.setItem("companyConfigured", "true");
}

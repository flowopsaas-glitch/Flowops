// src/api/base44Client.ts
type Base44Client = {
  page: string;
  auth?: {
    logout?: () => Promise<void>;
  };
};

export const base44: Base44Client = {
  page: "Dashboard",
  auth: {
    async logout() {
      // optional - your real logout may call an API
      return;
    },
  },
};
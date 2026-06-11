import { defineConfig } from '@prisma/cli';

export default defineConfig({
  datasources: {
    db: {
      adapter: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
});

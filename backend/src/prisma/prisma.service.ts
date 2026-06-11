import {
  Injectable,
  OnModuleInit,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { tenantMiddleware } from "./tenant-isolation.middleware";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger("PrismaService");

  constructor() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      throw new Error("DATABASE_URL is required in .env");
    }

    super({
      datasources: {
        db: { url: dbUrl },
      },
      log: [
        { emit: "event", level: "query" },
        { emit: "stdout", level: "error" },
        { emit: "stdout", level: "info" },
        { emit: "stdout", level: "warn" },
      ],
    });

    // --- FIX STARTS HERE ---
    // We moved these lines inside the constructor so they run when the service starts
    this.$use(tenantMiddleware);
    this.logger.log("Tenant isolation middleware active");
    // --- FIX ENDS HERE ---
  }

  async onModuleInit() {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        await this.$connect();
        this.logger.log("DATABASE LIVE: Connection verified");
        return;
      } catch (err: any) {
        attempts++;
        this.logger.warn(
          "DB Connection Attempt " +
            attempts +
            "/" +
            maxAttempts +
            " failed. Retrying in 2s...",
        );
        if (err.message.includes("Authentication failed")) {
          this.logger.error("AUTH ERROR: Check DB_PASSWORD in .env");
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    this.logger.error("FATAL: Database connection could not be established.");
    process.exit(1);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

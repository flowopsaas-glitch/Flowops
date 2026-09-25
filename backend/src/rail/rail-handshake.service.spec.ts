import { BadRequestException } from "@nestjs/common";
import {
  DeviationStatus,
  EscalationStage,
  HandshakeReportStatus,
} from "@prisma/client";
import { RailHandshakeService } from "./rail-handshake.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "../billing/billing.service";

const COMPANY_ID = "company-a";
const REPORT_ID = "report-a";
const DEVIATION_ID = "deviation-a";

const makeDeviation = (overrides: Record<string, unknown> = {}) => ({
  id: DEVIATION_ID,
  reportId: REPORT_ID,
  status: DeviationStatus.LOGGED,
  escalationStage: EscalationStage.LIAISON_MANAGER_24H,
  costRecovered: false,
  report: { status: HandshakeReportStatus.PENDING_TOC },
  ...overrides,
});

function makePrisma() {
  return {
    railHandshakeReport: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    railHandshakeDeviation: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe("RailHandshakeService workflow integrity", () => {
  let service: RailHandshakeService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new RailHandshakeService(prisma, {
      hasFeature: jest.fn().mockResolvedValue(true),
    } as unknown as BillingService);
  });

  it("tenant-scopes deviation lookups before allowing a review", async () => {
    (prisma.railHandshakeDeviation.findFirst as jest.Mock).mockResolvedValue(
      null,
    );

    await expect(
      service.reviewDeviation(COMPANY_ID, REPORT_ID, DEVIATION_ID, {
        agree: true,
      }),
    ).rejects.toThrow("Deviation not found");

    expect(prisma.railHandshakeDeviation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: DEVIATION_ID,
          reportId: REPORT_ID,
          report: { companyId: COMPANY_ID },
        },
      }),
    );
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
  });

  it("does not allow a review after the deviation has left LOGGED", async () => {
    (prisma.railHandshakeDeviation.findFirst as jest.Mock).mockResolvedValue(
      makeDeviation({ status: DeviationStatus.OPEN }),
    );

    await expect(
      service.reviewDeviation(COMPANY_ID, REPORT_ID, DEVIATION_ID, {
        agree: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
  });

  it("only resolves OPEN deviations", async () => {
    (prisma.railHandshakeDeviation.findFirst as jest.Mock).mockResolvedValue(
      makeDeviation({ status: DeviationStatus.LOGGED }),
    );

    await expect(
      service.resolveDeviation(COMPANY_ID, REPORT_ID, DEVIATION_ID, {}),
    ).rejects.toThrow("Only an OPEN deviation can be resolved.");
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
  });

  it("does not expose the regulator dispute action before the RLF stage", async () => {
    (prisma.railHandshakeDeviation.findFirst as jest.Mock).mockResolvedValue(
      makeDeviation({
        status: DeviationStatus.OPEN,
        escalationStage: EscalationStage.HEAD_LIAISON_48H,
      }),
    );

    await expect(
      service.lodgeDispute(COMPANY_ID, REPORT_ID, DEVIATION_ID),
    ).rejects.toThrow("Route Logistics Forum");
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
    expect(prisma.railHandshakeReport.update).not.toHaveBeenCalled();
  });

  it("preserves the audit trail by allowing deletion only before review", async () => {
    (prisma.railHandshakeDeviation.findFirst as jest.Mock).mockResolvedValue(
      makeDeviation({ status: DeviationStatus.AGREED }),
    );

    await expect(
      service.removeDeviation(COMPANY_ID, REPORT_ID, DEVIATION_ID),
    ).rejects.toThrow("Only an unreviewed deviation can be deleted.");
    expect(prisma.railHandshakeDeviation.delete).not.toHaveBeenCalled();
  });

  it("rejects all deviation mutations against a closed report", async () => {
    (prisma.railHandshakeDeviation.findFirst as jest.Mock).mockResolvedValue(
      makeDeviation({ report: { status: HandshakeReportStatus.CLOSED } }),
    );

    await expect(
      service.resolveDeviation(COMPANY_ID, REPORT_ID, DEVIATION_ID, {}),
    ).rejects.toThrow(/not available while the report is CLOSED/);
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
  });
});

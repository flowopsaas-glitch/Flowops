import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DriverPortalService } from "./driver-portal.service";

/**
 * Driver portal — chain-of-custody and tenant-isolation tests.
 *
 * This module is the driver-facing write path: POD capture, linehaul
 * confirmation, dispatch chat. The tests below pin the two properties that
 * matter most there:
 *
 *   1. POD capture is scoped — a waybill is only writable when it belongs to
 *      the token's company AND is dispatched to the token's driver. Missing
 *      driver/tenant context must fail closed, never fall back to "any waybill
 *      by id".
 *   2. Dispatch-side reads are tenant-scoped — the driverId is a route param,
 *      so the company filter is the only thing keeping one tenant out of
 *      another tenant's driver chat.
 */

describe("DriverPortalService", () => {
  let service: DriverPortalService;
  let prisma: any;
  let notifications: any;
  let gateway: any;

  beforeEach(() => {
    prisma = {
      waybill: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      shipment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      collection: { findMany: jest.fn() },
      manifest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      driver: { findFirst: jest.fn(), findUnique: jest.fn() },
      driverChatMessage: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<any>) => callback(prisma));
    notifications = {
      notifyWaybillStatus: jest.fn().mockResolvedValue(undefined),
      sendRatingRequest: jest.fn().mockResolvedValue(undefined),
    };
    gateway = { emitShipmentUpdate: jest.fn() };
    service = new DriverPortalService(
      prisma,
      notifications,
      gateway,
      {} as any, // DriverSafetyService — not used on these paths
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── POD capture ─────────────────────────────────────────────────────────

  describe("recordPod", () => {
    const pod = {
      waybillId: "wb-1",
      driverId: "driver-1",
      companyId: "company-1",
      signatureUrl: "https://cdn/sig.png",
      imageUrl: "https://cdn/pod.png",
      recipientName: "T. Mokoena",
    };

    it("rejects when companyId is missing (must fail closed, not degrade)", async () => {
      await expect(
        service.recordPod({
          waybillId: "wb-1",
          driverId: "driver-1",
          companyId: "",
        }),
      ).rejects.toThrow(BadRequestException);
      // No DB call may happen before the guard.
      expect(prisma.waybill.findFirst).not.toHaveBeenCalled();
      expect(prisma.waybill.update).not.toHaveBeenCalled();
    });

    it("rejects when driverId is missing (must fail closed, not degrade)", async () => {
      await expect(
        service.recordPod({
          waybillId: "wb-1",
          driverId: "",
          companyId: "company-1",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.waybill.findFirst).not.toHaveBeenCalled();
      expect(prisma.waybill.update).not.toHaveBeenCalled();
    });

    it("scopes the lookup to the token company AND assigned driver", async () => {
      prisma.waybill.findFirst.mockResolvedValue(null);
      await expect(service.recordPod(pod)).rejects.toThrow(NotFoundException);
      expect(prisma.waybill.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "wb-1",
            companyId: "company-1",
            shipments: { some: { driverId: "driver-1" } },
          },
        }),
      );
    });

    it("refuses when the waybill belongs to another tenant or another driver", async () => {
      // The scoped lookup returning null is the whole authorisation check.
      prisma.waybill.findFirst.mockResolvedValue(null);
      await expect(service.recordPod(pod)).rejects.toThrow(
        "Waybill not found or not assigned to you",
      );
      expect(prisma.waybill.update).not.toHaveBeenCalled();
    });

    it("marks DELIVERED, syncs the shipment, and closes the loop", async () => {
      const updated = {
        id: "wb-1",
        trackingNumber: "WB-2026-0001",
        status: "DELIVERED",
        companyId: "company-1",
      };
      prisma.waybill.findFirst.mockResolvedValue({
        id: "wb-1",
        status: "IN_TRANSIT",
        companyId: "company-1",
        trackingNumber: "WB-2026-0001",
      });
      prisma.waybill.updateMany.mockResolvedValue({ count: 1 });
      prisma.waybill.findUniqueOrThrow.mockResolvedValue(updated);
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.recordPod(pod);

      expect(result).toEqual(updated);
      expect(prisma.waybill.updateMany).toHaveBeenCalledWith({
        where: {
          id: "wb-1",
          companyId: "company-1",
          status: { not: "DELIVERED" },
        },
        data: {
          status: "DELIVERED",
          podSignatureUrl: "https://cdn/sig.png",
          podImageUrl: "https://cdn/pod.png",
          podRecipient: "T. Mokoena",
          podDeliveredAt: expect.any(Date),
        },
      });
      // Shipment row must follow the waybill or the dispatch board lies.
      expect(prisma.shipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { waybillId: "wb-1", companyId: "company-1" },
          data: expect.objectContaining({ status: "DELIVERED" }),
        }),
      );
      // Best-effort side effects all fire.
      expect(notifications.notifyWaybillStatus).toHaveBeenCalledWith(updated);
      expect(notifications.sendRatingRequest).toHaveBeenCalledWith(updated);
      expect(gateway.emitShipmentUpdate).toHaveBeenCalledWith("company-1", {
        waybillId: "wb-1",
        trackingNumber: "WB-2026-0001",
        status: "DELIVERED",
        source: "driver-pod",
      });
    });

    it("still returns the POD when realtime emit fails (best-effort)", async () => {
      prisma.waybill.findFirst.mockResolvedValue({
        id: "wb-1",
        status: "IN_TRANSIT",
        companyId: "company-1",
        trackingNumber: "WB-2026-0001",
      });
      prisma.waybill.updateMany.mockResolvedValue({ count: 1 });
      prisma.waybill.findUniqueOrThrow.mockResolvedValue({
        id: "wb-1",
        trackingNumber: "WB-2026-0001",
        companyId: "company-1",
      });
      prisma.shipment.updateMany.mockResolvedValue({ count: 1 });
      gateway.emitShipmentUpdate.mockImplementation(() => {
        throw new Error("gateway down");
      });

      const result = await service.recordPod(pod);
      expect(result.id).toBe("wb-1");
    });
  });

  // ── Dispatch chat tenant scoping ────────────────────────────────────────

  describe("chat scoping", () => {
    it("getMessagesForCompany filters by BOTH driver and company", async () => {
      prisma.driverChatMessage.findMany.mockResolvedValue([]);
      await service.getMessagesForCompany("driver-1", "company-1");
      expect(prisma.driverChatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: "driver-1", companyId: "company-1" },
        }),
      );
    });

    it("getMessages (driver token path) filters by driverId", async () => {
      prisma.driverChatMessage.findMany.mockResolvedValue([]);
      await service.getMessages("driver-1");
      expect(prisma.driverChatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverId: "driver-1" } }),
      );
    });

    it("sendMessage pins the session company onto the row", async () => {
      prisma.driverChatMessage.create.mockResolvedValue({ id: "m1" });
      await service.sendMessage("driver-1", "company-1", "ETA 10 min");
      expect(prisma.driverChatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          driverId: "driver-1",
          companyId: "company-1",
          message: "ETA 10 min",
        }),
      });
    });

    it("markRead with a driverId bulk-marks only that driver's unread dispatch messages", async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: "driver-1" });
      prisma.driverChatMessage.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markRead("driver-1");

      expect(result).toEqual({ ok: true, marked: 3 });
      expect(prisma.driverChatMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            driverId: "driver-1",
            senderType: "dispatch",
            readAt: null,
          },
        }),
      );
    });

    it("markRead falls back to single-message update for a message id", async () => {
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.driverChatMessage.update.mockResolvedValue({ id: "m1" });

      await service.markRead("m1");

      expect(prisma.driverChatMessage.update).toHaveBeenCalledWith({
        where: { id: "m1" },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  // ── Linehaul chain of custody ───────────────────────────────────────────

  describe("confirmLinehaulDelivery", () => {
    it("refuses a manifest that is not assigned to this driver", async () => {
      prisma.manifest.findFirst.mockResolvedValue(null);
      await expect(
        service.confirmLinehaulDelivery("man-1", "driver-1", "company-1"),
      ).rejects.toThrow(
        "Manifest not found, already delivered, or not assigned to you",
      );
      expect(prisma.manifest.update).not.toHaveBeenCalled();
    });

    it("marks the manifest dispatched and advances its waybills", async () => {
      prisma.manifest.findFirst.mockResolvedValue({
        id: "man-1",
        code: "MF-001",
        waybills: [{ waybillId: "wb-1" }, { waybillId: "wb-2" }],
        branch: { name: "Johannesburg DC" },
      });
      prisma.manifest.update.mockResolvedValue({});
      prisma.waybill.updateMany.mockResolvedValue({ count: 2 });
      prisma.driver.findFirst.mockResolvedValue(null); // no reassignment targets

      const result = await service.confirmLinehaulDelivery(
        "man-1",
        "driver-1",
        "company-1",
      );

      expect(result).toEqual({
        success: true,
        manifestCode: "MF-001",
        destinationBranch: "Johannesburg DC",
        waybillsDelivered: 2,
      });
      expect(prisma.manifest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "man-1" },
          data: expect.objectContaining({ dispatched: true }),
        }),
      );
      expect(prisma.waybill.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["wb-1", "wb-2"] } },
          data: { status: "AT_DESTINATION_HUB" },
        }),
      );
    });
  });

  // ── Job feed ────────────────────────────────────────────────────────────

  describe("getDriverJobs", () => {
    it("returns collections and deliveries as one flat feed, scoped to the driver", async () => {
      prisma.collection.findMany.mockResolvedValue([
        { id: "c1aaaaaaaaaaaa", status: "PENDING", clientName: "K. Naidoo" },
      ]);
      prisma.shipment.findMany.mockResolvedValue([
        { id: "s1", status: "IN_TRANSIT", waybillId: "wb-1" },
      ]);
      prisma.waybill.findMany.mockResolvedValue([
        { id: "wb-1", trackingNumber: "WB-2026-0001", status: "IN_TRANSIT" },
      ]);

      const jobs = await service.getDriverJobs("driver-1");

      // Flat feed: one entry per job, each tagged with its kind.
      expect(jobs.map((j: any) => j.type)).toEqual(["collection", "delivery"]);
      // Both source queries must be scoped to the token driver.
      expect(prisma.collection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ driverId: "driver-1" }),
        }),
      );
      expect(prisma.shipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ driverId: "driver-1" }),
        }),
      );
    });
  });
});

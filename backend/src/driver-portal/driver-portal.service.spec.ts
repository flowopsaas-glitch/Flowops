import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { DriverPortalService } from "./driver-portal.service";
import { legalPredecessorStatuses } from "../waybills/waybill-status.machine";

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
  let epod: any;
  let compliance: any;
  let audit: any;
  let outbox: any;

  beforeEach(() => {
    prisma = {
      waybill: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
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
      driver: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      driverChatMessage: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      trackingEvent: { create: jest.fn() },
      // The linehaul confirmation runs in one transaction; the mock executes the
      // callback against the same jest mocks so assertions see every write.
      $transaction: jest.fn(async (fn: any) => fn(tx(prisma))),
    };
    function tx(p: any) {
      return {
        manifest: {
          updateMany: jest.fn(async () => p.manifest.updateManyResult ?? { count: 1 }),
        },
        waybill: {
          updateMany: jest.fn(async (args: any) => {
            p.waybill.updateManyCalls = [...(p.waybill.updateManyCalls ?? []), args];
            return p.waybill.updateManyResult ?? { count: 1 };
          }),
          findFirst: jest.fn(async () =>
            p.waybill.currentResult ?? { status: "CANCELLED", trackingNumber: "WB-CANCELLED" },
          ),
        },
        trackingEvent: { create: jest.fn() },
        shipment: {
          findFirst: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
        },
      };
    }
    notifications = {
      notifyWaybillStatus: jest.fn().mockResolvedValue(undefined),
      sendRatingRequest: jest.fn().mockResolvedValue(undefined),
    };
    gateway = { emitShipmentUpdate: jest.fn() };
    audit = { record: jest.fn(async () => 'audit-1') };
    // EpodService owns the POD write path (custody, duplicate guard, one
    // transaction); this suite pins the driver-app wiring around it.
    epod = { capture: jest.fn() };
    compliance = {
      // The compliance gate is exercised in its own suite; here it must simply
      // not block unless a test says so.
      filterDispatchable: jest.fn((rows: any[]) => rows.map((snapshot) => ({ snapshot, compliance: {} }))),
      assertDispatchable: jest.fn(),
    };
    outbox = { enqueue: jest.fn() };
    service = new DriverPortalService(
      prisma,
      notifications,
      gateway,
      {} as any, // DriverSafetyService — not used on these paths
      epod,
      compliance,
      audit,
      outbox,
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
    const deliveredWaybill = {
      id: "wb-1",
      trackingNumber: "WB-2026-0001",
      status: "DELIVERED",
      companyId: "company-1",
    };

    it("rejects when companyId is missing (must fail closed, not degrade)", async () => {
      await expect(
        service.recordPod({
          waybillId: "wb-1",
          driverId: "driver-1",
          companyId: "",
        }),
      ).rejects.toThrow(BadRequestException);
      // Nothing may be written before the guard.
      expect(epod.capture).not.toHaveBeenCalled();
      expect(prisma.waybill.updateMany).not.toHaveBeenCalled();
    });

    it("rejects when driverId is missing (must fail closed, not degrade)", async () => {
      await expect(
        service.recordPod({
          waybillId: "wb-1",
          driverId: "",
          companyId: "company-1",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(epod.capture).not.toHaveBeenCalled();
    });

    it("delegates the write (custody + duplicate guard + atomicity) to EpodService", async () => {
      epod.capture.mockResolvedValue({ id: "epod-1", status: "CAPTURED" });
      prisma.waybill.findFirst.mockResolvedValue(deliveredWaybill);

      await service.recordPod(pod);

      expect(epod.capture).toHaveBeenCalledWith(
        "company-1",
        {
          waybillId: "wb-1",
          driverId: "driver-1",
          signatureUrl: "https://cdn/sig.png",
          photoUrls: ["https://cdn/pod.png"],
          recipientName: "T. Mokoena",
          notes: undefined,
          geoLat: undefined,
          geoLng: undefined,
        },
        { driverId: "driver-1", role: "DRIVER" },
      );
    });

    it("refuses when the waybill belongs to another tenant or another driver (surfaces the ePOD decision)", async () => {
      epod.capture.mockRejectedValue(new NotFoundException("Waybill not found"));
      await expect(service.recordPod(pod)).rejects.toThrow("Waybill not found");
      // A refused capture must not notify anyone or push realtime updates.
      expect(notifications.notifyWaybillStatus).not.toHaveBeenCalled();
      expect(gateway.emitShipmentUpdate).not.toHaveBeenCalled();
    });

    it("surfaces a duplicate ePOD submission as a conflict and stays silent", async () => {
      epod.capture.mockRejectedValue(new ConflictException("An ePOD has already been captured for this waybill"));
      await expect(service.recordPod(pod)).rejects.toThrow(ConflictException);
      expect(notifications.sendRatingRequest).not.toHaveBeenCalled();
    });

    it("returns the delivered waybill plus the ePOD id, and closes the loop after the commit", async () => {
      epod.capture.mockResolvedValue({ id: "epod-1", status: "CAPTURED" });
      prisma.waybill.findFirst.mockResolvedValue(deliveredWaybill);

      const result = await service.recordPod(pod);

      expect(result).toMatchObject({ ...deliveredWaybill, epodId: "epod-1", podStatus: "CAPTURED" });
      // Side effects run after the atomic write committed.
      expect(notifications.notifyWaybillStatus).toHaveBeenCalledWith(deliveredWaybill);
      expect(notifications.sendRatingRequest).toHaveBeenCalledWith(deliveredWaybill);
      expect(gateway.emitShipmentUpdate).toHaveBeenCalledWith("company-1", {
        waybillId: "wb-1",
        trackingNumber: "WB-2026-0001",
        status: "DELIVERED",
        source: "driver-pod",
      });
    });

    it("still returns the POD when realtime emit fails (best-effort)", async () => {
      epod.capture.mockResolvedValue({ id: "epod-1", status: "CAPTURED" });
      prisma.waybill.findFirst.mockResolvedValue(deliveredWaybill);
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
    const manifest = {
      id: "man-1",
      code: "MF-001",
      driverId: "driver-1",
      dispatched: false,
      waybills: [{ waybillId: "wb-1" }, { waybillId: "wb-2" }],
      branch: { name: "Johannesburg DC" },
    };

    it("refuses a manifest that is not assigned to this driver (scoped lookup)", async () => {
      prisma.manifest.findFirst.mockResolvedValue(null);
      await expect(
        service.confirmLinehaulDelivery("man-1", "driver-1", "company-1"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.manifest.update).not.toHaveBeenCalled();
    });

    it("claims the manifest, moves its waybills to the destination hub and hands over inside ONE transaction", async () => {
      prisma.manifest.findFirst.mockResolvedValue(manifest);
      prisma.driver.findMany.mockResolvedValue([
        { id: "driver-9", companyId: "company-1", isActive: true, status: "AVAILABLE" },
      ]);

      const result = await service.confirmLinehaulDelivery("man-1", "driver-1", "company-1");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        success: true,
        manifestCode: "MF-001",
        destinationBranch: "Johannesburg DC",
        waybillsDelivered: 2,
        reassignedTo: "driver-9",
        awaitingManualDispatch: false,
      });
    });

    it("reports parcels left awaiting manual dispatch when no compliant driver is free", async () => {
      prisma.manifest.findFirst.mockResolvedValue(manifest);
      prisma.driver.findMany.mockResolvedValue([]); // nobody available

      const result = await service.confirmLinehaulDelivery("man-1", "driver-1", "company-1");
      expect(result).toMatchObject({ reassignedTo: null, awaitingManualDispatch: true });
    });

    it("a second confirmation is refused by the compare-and-set (no double delivery)", async () => {
      prisma.manifest.findFirst.mockResolvedValue(manifest);
      prisma.driver.findMany.mockResolvedValue([]);
      prisma.manifest.updateManyResult = { count: 0 }; // the claim is already taken

      await expect(
        service.confirmLinehaulDelivery("man-1", "driver-1", "company-1"),
      ).rejects.toThrow(ConflictException);
      prisma.manifest.updateManyResult = undefined;
    });

    it("skips a waybill that is no longer in a movable state, reports it, and audits the refusal", async () => {
      prisma.manifest.findFirst.mockResolvedValue(manifest);
      prisma.driver.findMany.mockResolvedValue([]);
      prisma.waybill.updateManyResult = { count: 0 }; // e.g. cancelled mid-route
      prisma.waybill.currentResult = { status: "CANCELLED", trackingNumber: "WB-2026-0001" };

      const result = await service.confirmLinehaulDelivery("man-1", "driver-1", "company-1");

      expect(result).toMatchObject({ waybillsDelivered: 0, waybillsSkipped: 2 });
      expect(result.skippedWaybills[0]).toMatchObject({
        trackingNumber: "WB-2026-0001",
        status: "CANCELLED",
      });
      // The gap must be on the audit rail, not only in the response.
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "waybill.transition_rejected",
          targetType: "waybill",
          targetId: "wb-1",
          metadata: expect.objectContaining({
            attempted: "AT_DESTINATION_HUB",
            from: "CANCELLED",
            reason: "illegal_transition",
            source: "driver-portal.linehaul",
          }),
        }),
      );
      prisma.waybill.updateManyResult = undefined;
    });

    it("derives the compare-and-set whitelist from the state machine, not by hand", async () => {
      prisma.manifest.findFirst.mockResolvedValue(manifest);
      prisma.driver.findMany.mockResolvedValue([]);

      await service.confirmLinehaulDelivery("man-1", "driver-1", "company-1");

      // The whitelist the CAS actually used must equal what the machine says.
      // Hand-written, it previously accepted COLLECTED and OUT_FOR_DELIVERY —
      // two jumps the machine refuses.
      const used = prisma.waybill.updateManyCalls[0].where.status.in;
      expect([...used].sort()).toEqual(legalPredecessorStatuses("AT_DESTINATION_HUB").sort());
      expect(used).not.toContain("COLLECTED");
      expect(used).not.toContain("OUT_FOR_DELIVERY");
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

import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

type AnyRecord = Record<string, any>;

type SyncRecord = {
  id: any;
  collectionId: any;
  reference: any;
  customerName: string;
  status: string;
  destination: string;
  shipmentStatus: string;
  dispatchStatus: string;
  podStatus: string;
  invoiceStatus: string;
  shipmentLinked: boolean;
  dispatchLinked: boolean;
  podLinked: boolean;
  invoiceLinked: boolean;
  rateCardLinked: boolean;
  driverAssigned: boolean;
  driverName: string | null;
  driverId: any;
  syncHealth: string;
  aiFlags: string[];
  aiPriority: string;
  lastUpdatedAt: string;
  links: {
    shipmentId: any;
    dispatchId: any;
    podId: any;
    invoiceId: any;
    rateCardId: any;
  };
};

type DriverSuggestion = {
  id: any;
  name: string;
  vehicleType: string;
  activeAssignments: number;
  available: boolean;
  zoneMatch: boolean;
  score: number;
  raw: AnyRecord;
};

@Injectable()
export class CollectionStateSyncService {
  private readonly dataDir = path.resolve(process.cwd(), "data");

  private readonly storeCandidates = {
    collections: [
      "collection-ops-store.json",
      "collections-store.json",
      "collection-store.json",
      "collection-requests.json",
    ],
    shipments: [
      "shipment-store.json",
      "shipments-store.json",
      "shipment-ops-store.json",
      "waybill-store.json",
      "waybills-store.json",
      "waybill-drafts-store.json",
    ],
    drivers: [
      "driver-store.json",
      "drivers-store.json",
      "driver-ops-store.json",
    ],
    dispatch: [
      "dispatch-store.json",
      "dispatches-store.json",
      "driver-dispatch-store.json",
    ],
    pod: [
      "pod-store.json",
      "deliveries-store.json",
      "delivery-store.json",
      "pod-delivery-store.json",
    ],
    invoices: [
      "invoice-draft-store.json",
      "invoice-store.json",
      "invoices-store.json",
    ],
    rateCards: [
      "rate-card-store.json",
      "rate-cards-store.json",
    ],
    audit: [
      "collection-state-sync-audit.json",
    ],
  };

  getDashboard(tenantId?: string) {
    const records = this.getRecords(tenantId);

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      totals: {
        collections: records.length,
        fullySynced: records.filter((r: SyncRecord) => r.syncHealth === "SYNCED").length,
        partial: records.filter((r: SyncRecord) => r.syncHealth === "PARTIAL").length,
        broken: records.filter((r: SyncRecord) => r.syncHealth === "BROKEN").length,
        pendingAssignment: records.filter((r: SyncRecord) => !r.driverAssigned).length,
        delayed: records.filter((r: SyncRecord) => r.aiFlags.includes("DELAY_RISK")).length,
        overloadRisk: records.filter((r: SyncRecord) => r.aiFlags.includes("DRIVER_OVERLOAD")).length,
        billingMismatch: records.filter((r: SyncRecord) => r.aiFlags.includes("BILLING_MISMATCH")).length,
      },
      moduleHealth: {
        shipmentsLinked: records.filter((r: SyncRecord) => r.shipmentLinked).length,
        dispatchLinked: records.filter((r: SyncRecord) => r.dispatchLinked).length,
        podLinked: records.filter((r: SyncRecord) => r.podLinked).length,
        invoiceLinked: records.filter((r: SyncRecord) => r.invoiceLinked).length,
      },
      records: records.slice(0, 20),
    };
  }

  getRecords(tenantId?: string): SyncRecord[] {
    const collectionsStore = this.readStore("collections");
    const shipmentsStore = this.readStore("shipments");
    const driversStore = this.readStore("drivers");
    const dispatchStore = this.readStore("dispatch");
    const podStore = this.readStore("pod");
    const invoicesStore = this.readStore("invoices");
    const rateCardsStore = this.readStore("rateCards");

    const collections = this.extractArray(collectionsStore, [
      "items", "requests", "collections", "rows", "data", "records",
    ]).map((item: AnyRecord) => this.normalizeCollection(item));

    const shipments = this.extractArray(shipmentsStore, [
      "items", "shipments", "rows", "data", "records", "waybills", "drafts",
    ]);

    const drivers = this.extractArray(driversStore, [
      "items", "drivers", "rows", "data", "records",
    ]);

    const dispatches = this.extractArray(dispatchStore, [
      "items", "dispatches", "rows", "data", "records", "jobs",
    ]);

    const pods = this.extractArray(podStore, [
      "items", "deliveries", "pods", "rows", "data", "records",
    ]);

    const invoices = this.extractArray(invoicesStore, [
      "items", "drafts", "invoices", "rows", "data", "records",
    ]);

    const rateCards = this.extractArray(rateCardsStore, [
      "items", "rateCards", "rates", "rows", "data", "records",
    ]);

    const filteredCollections = tenantId
      ? collections.filter((c: AnyRecord) => this.sameTenant(c, tenantId))
      : collections;

    return filteredCollections.map((collection: AnyRecord): SyncRecord => {
      const shipment = this.findBestLinkedRecord(collection, shipments) ?? undefined;
      const dispatch =
        this.findBestLinkedRecord(collection, dispatches) ||
        dispatches.find((d: AnyRecord) =>
          this.firstTruthy(
            d.collectionId,
            d.collection_id,
            d.reference,
          ) === this.firstTruthy(
            collection.collectionId,
            collection.id,
            collection.reference,
          )
        ) ||
        undefined;

      const pod = this.findBestLinkedRecord(collection, pods) ?? undefined;

      const invoice = this.findBestLinkedRecord(collection, invoices) ?? undefined;
      const driver =
        drivers.find((d: AnyRecord) => this.isDriverAssigned(collection, dispatch, d)) ||
        drivers.find((d: AnyRecord) =>
          this.firstTruthy(
            d.name,
            d.fullName,
            d.driverName,
          ) === this.firstTruthy(
            collection.driverName,
            collection.assignedDriver,
          )
        ) ||
        undefined;
      const rateCard = rateCards.find((r: AnyRecord) => this.isRateCardLinked(collection, r));

      const derivedDispatchStatus = this.firstTruthy(
        dispatch?.status,
        dispatch?.dispatchStatus,
        dispatch?.state,
        dispatch?.jobStatus,
        dispatch?.assignmentStatus,
        dispatch?.driverId ? "ASSIGNED" : null,
        dispatch?.assignedDriverId ? "ASSIGNED" : null,
        dispatch?.driverName ? "ASSIGNED" : null,
        dispatch?.assignedDriver ? "ASSIGNED" : null,
        collection?.driverId ? "ASSIGNED" : null,
        collection?.assignedDriverId ? "ASSIGNED" : null,
        collection?.driverName ? "ASSIGNED" : null,
        collection?.assignedDriver ? "ASSIGNED" : null,
        "UNKNOWN",
      );

      const statuses = {
        collection: this.normalizeStatus(collection.status),
        shipment: this.normalizeStatus(
          this.firstTruthy(shipment?.status, shipment?.shipmentStatus, shipment?.state, "UNKNOWN"),
        ),
        dispatch: this.normalizeStatus(derivedDispatchStatus),
        pod: this.normalizeStatus(
          this.firstTruthy(pod?.status, pod?.deliveryStatus, pod?.state, "UNKNOWN"),
        ),
        invoice: this.normalizeStatus(
          this.firstTruthy(invoice?.status, invoice?.invoiceStatus, invoice?.state, "UNKNOWN"),
        ),
      };

      const syncHealth = this.computeSyncHealth(statuses, {
        shipmentLinked: !!shipment,
        dispatchLinked: !!dispatch,
        podLinked: !!pod,
        invoiceLinked: !!invoice,
      });

      const resolvedDriverId =
        this.firstTruthy(
          dispatch?.driverId,
          dispatch?.driver_id,
          dispatch?.assignedDriverId,
          shipment?.driverId,
          shipment?.driver_id,
          shipment?.assignedDriverId,
          collection?.driverId,
          collection?.driver_id,
          collection?.assignedDriverId,
          driver?.id,
          driver?.driverId,
        ) || null;

      const resolvedDriverRecord = drivers.find((d: AnyRecord) => {
        const driverKeys = [
          this.firstTruthy(d?.id, d?.driverId),
          this.firstTruthy(d?.name, d?.fullName),
        ]
          .filter(Boolean)
          .map((value: any) => String(value).trim().toLowerCase());

        const targetKeys = [
          resolvedDriverId,
          dispatch?.driverName,
          dispatch?.assignedDriver,
          shipment?.driverName,
          shipment?.assignedDriver,
          collection?.driverName,
          collection?.assignedDriver,
        ]
          .filter(Boolean)
          .map((value: any) => String(value).trim().toLowerCase());

        return targetKeys.some((value: string) => driverKeys.includes(value));
      });

      const resolvedDriverName =
        this.firstTruthy(
          resolvedDriverRecord?.name,
          resolvedDriverRecord?.fullName,
          dispatch?.driverName,
          dispatch?.assignedDriver,
          shipment?.driverName,
          shipment?.assignedDriver,
          collection?.driverName,
          collection?.assignedDriver,
          driver?.name,
          driver?.fullName,
        ) || null;

      const driverAssigned = !!resolvedDriverName || !!resolvedDriverId;

      const aiFlags = this.computeAiFlags(collection, shipment, dispatch, pod, invoice, driver);

      return {
        id: this.primaryId(collection),
        collectionId: this.primaryId(collection),
        reference: this.firstTruthy(
          collection.reference,
          collection.collectionRef,
          collection.collectionNumber,
          collection.requestNumber,
          collection.waybillNumber,
          collection.waybillNo,
          collection.trackingNumber,
          collection.code,
        ),
        customerName:
          this.firstTruthy(
            collection.customerName,
            collection.clientName,
            collection.senderName,
            collection.companyName,
            collection.accountName,
          ) || "Unknown customer",
        status: statuses.collection || "PENDING",
        destination:
          this.firstTruthy(
            collection.destinationBranch,
            collection.destinationCity,
            collection.deliveryAddress,
            collection.zone,
            collection.area,
          ) || "Unknown destination",
        shipmentStatus: statuses.shipment || "UNKNOWN",
        dispatchStatus: statuses.dispatch || "UNKNOWN",
        podStatus: statuses.pod || "UNKNOWN",
        invoiceStatus: statuses.invoice || "UNKNOWN",
        shipmentLinked: !!shipment,
        dispatchLinked: !!dispatch,
        podLinked: !!pod,
        invoiceLinked: !!invoice,
        rateCardLinked: !!rateCard,
        driverAssigned,
        driverName: resolvedDriverName,
        driverId: resolvedDriverId,
        syncHealth,
        aiFlags,
        aiPriority: this.computePriority(collection, aiFlags),
        lastUpdatedAt:
          this.firstTruthy(
            collection.updatedAt,
            shipment?.updatedAt,
            dispatch?.updatedAt,
            pod?.updatedAt,
            invoice?.updatedAt,
            collection.createdAt,
          ) || new Date().toISOString(),
        links: {
          shipmentId: shipment ? this.primaryId(shipment) : null,
          dispatchId: dispatch ? this.primaryId(dispatch) : null,
          podId: pod ? this.primaryId(pod) : null,
          invoiceId: invoice ? this.primaryId(invoice) : null,
          rateCardId: rateCard ? this.primaryId(rateCard) : null,
        },
      };
    });
  }

  getWorkflow(collectionId: string, tenantId?: string) {
    const records = this.getRecords(tenantId);
    const record = records.find(
      (item: AnyRecord) =>
        String(item.collectionId || item.id || "") === String(collectionId || "")
    );

    if (!record) {
      return {
        ok: false,
        workflow: null,
        suggestedNextActions: [],
      };
    }

    const suggestedNextActions: string[] = [];

    if (!record.driverAssigned) suggestedNextActions.push("Assign driver");
    if (!record.dispatchLinked || record.dispatchStatus === "UNKNOWN") suggestedNextActions.push("Create dispatch job");
    if (record.syncHealth !== "SYNCED") suggestedNextActions.push("Repair sync");
    if (!record.invoiceLinked) suggestedNextActions.push("Create invoice");

    return {
      ok: true,
      workflow: {
        collection: {
          reference: record.reference || record.collectionId || record.id || "Unknown",
          customerName: record.customerName || "Unknown",
          destination: record.destination || "Unknown",
          syncHealth: record.syncHealth || "UNKNOWN",
          aiPriority: record.aiPriority || "NORMAL",
          driverName: record.driverName || (record.driverAssigned ? "Assigned" : "Unassigned"),
        },
        shipment: {
          status: record.shipmentStatus || "UNKNOWN",
        },
        dispatch: {
          status: record.dispatchStatus || (record.driverAssigned ? "ASSIGNED" : "UNKNOWN"),
        },
        pod: {
          status: record.podStatus || "UNKNOWN",
        },
        invoice: {
          status: record.invoiceStatus || "UNKNOWN",
        },
      },
      suggestedNextActions,
    };
  }

  suggestDriver(collectionId: string, tenantId?: string) {
    const result = this.computeDriverSuggestions(collectionId, tenantId);

    if (!result.ok) {
      return result;
    }

    const scored = Array.isArray(result.scored) ? result.scored : [];

    return {
      ok: true,
      collectionId,
      suggestion: scored[0] || null,
      alternatives: scored.slice(0, 5),
    };
  }

  autoAssignDriver(collectionId: string, actor = "system", tenantId?: string) {
    const suggestionResult = this.computeDriverSuggestions(collectionId, tenantId);

    if (!suggestionResult.ok) {
      return suggestionResult;
    }

    const scored = Array.isArray(suggestionResult.scored) ? suggestionResult.scored : [];
    const best = scored[0];

    if (!best) {
      return {
        ok: false,
        collectionId,
        message: "No driver available for auto-assignment",
      };
    }

    const collectionsStore = this.readStore("collections");
    const shipmentsStore = this.readStore("shipments");
    const dispatchStore = this.readStore("dispatch");
    const auditStore = this.readStore("audit");

    const collections = this.extractArray(collectionsStore, [
      "items", "requests", "collections", "rows", "data", "records",
    ]);

    const shipments = this.extractArray(shipmentsStore, [
      "items", "shipments", "rows", "data", "records", "waybills", "drafts",
    ]);

    const dispatches = this.extractArray(dispatchStore, [
      "items", "dispatches", "rows", "data", "records", "jobs",
    ]);

    const collection = collections.find((c: AnyRecord) => {
      if (tenantId && !this.sameTenant(c, tenantId)) return false;
      return String(this.primaryId(this.normalizeCollection(c))) === String(collectionId);
    });

    if (!collection) {
      return {
        ok: false,
        collectionId,
        message: `Collection ${collectionId} not found`,
      };
    }

    const normalizedCollection: AnyRecord = this.normalizeCollection(collection);
    const now = new Date().toISOString();

    const driverId = this.firstTruthy(best.id, best.raw?.id, best.raw?.driverId);
    const driverName = this.firstTruthy(best.name, best.raw?.name, best.raw?.fullName) || "Suggested Driver";

    collection.driverId = driverId;
    collection.driver_id = driverId;
    collection.driverName = driverName;
    collection.assignedDriver = driverName;
    collection.assignedDriverId = driverId;
    collection.status = this.assignmentStatus(collection.status);
    collection.updatedAt = now;

    const shipment = this.findBestLinkedRecord(normalizedCollection, shipments) ?? undefined;
    if (shipment) {
      shipment.driverId = driverId;
      shipment.driver_id = driverId;
      shipment.driverName = driverName;
      shipment.assignedDriver = driverName;
      shipment.status = this.shipmentAssignedStatus(shipment.status);
      shipment.updatedAt = now;
    }

    let dispatch = this.findBestLinkedRecord(normalizedCollection, dispatches) ?? undefined;
    if (!dispatch) {
      dispatch = {
        id: `dispatch-${Date.now()}-${collectionId}`,
        collectionId: this.primaryId(normalizedCollection),
        reference: this.firstTruthy(
          normalizedCollection.reference,
          normalizedCollection.collectionRef,
          normalizedCollection.collectionNumber,
          normalizedCollection.requestNumber,
        ),
        customerName: this.firstTruthy(
          normalizedCollection.customerName,
          normalizedCollection.clientName,
          normalizedCollection.senderName,
          normalizedCollection.companyName,
        ),
        destination: this.firstTruthy(
          normalizedCollection.destinationBranch,
          normalizedCollection.destinationCity,
          normalizedCollection.deliveryAddress,
          normalizedCollection.zone,
          normalizedCollection.area,
        ),
        status: "ASSIGNED",
        createdAt: now,
        updatedAt: now,
      };
      dispatches.unshift(dispatch);
    }

    dispatch.driverId = driverId;
    dispatch.driver_id = driverId;
    dispatch.driverName = driverName;
    dispatch.assignedDriver = driverName;
    dispatch.assignedDriverId = driverId;
    dispatch.status = "ASSIGNED";
    dispatch.updatedAt = now;

    this.writeStore("collections", collectionsStore, collections);
    this.writeStore("shipments", shipmentsStore, shipments);
    this.writeStore("dispatch", dispatchStore, dispatches);

    const auditRows = this.extractArray(auditStore, ["items", "rows", "data", "records"]);
    auditRows.unshift({
      id: `audit-${Date.now()}-${collectionId}`,
      type: "AUTO_ASSIGN_DRIVER",
      collectionId,
      actor,
      driverId,
      driverName,
      score: best.score,
      zoneMatch: best.zoneMatch,
      activeAssignments: best.activeAssignments,
      createdAt: now,
    });
    this.writeStore("audit", auditStore, auditRows);

    return {
      ok: true,
      collectionId,
      actor,
      assignedDriver: {
        id: driverId,
        name: String(driverName || best.name || "Assigned"),
        score: best.score ?? 0,
        vehicleType: String(best.vehicleType || "Vehicle linked"),
        zoneMatch: !!best.zoneMatch,
        activeAssignments: Number(best.activeAssignments ?? 0),
      },
      dispatchCreated: !suggestionResult.existingDispatch,
      timestamp: now,
      message: `Assigned ${driverName} to collection ${collectionId}`,
    };
  }

  bulkSync(actor = "system", tenantId?: string) {
    const records = this.getRecords(tenantId);
    const results = records.map((record: SyncRecord) =>
      this.syncCollection(String(record.collectionId), actor, tenantId),
    );

    return {
      ok: true,
      actor,
      timestamp: new Date().toISOString(),
      total: results.length,
      synced: results.filter((r: AnyRecord) => r.ok).length,
      results,
    };
  }

  syncCollection(collectionId: string, actor = "system", tenantId?: string) {
    const collectionsStore = this.readStore("collections");
    const shipmentsStore = this.readStore("shipments");
    const dispatchStore = this.readStore("dispatch");
    const podStore = this.readStore("pod");
    const invoicesStore = this.readStore("invoices");

    const collections = this.extractArray(collectionsStore, ["items", "requests", "collections", "rows", "data", "records"]);
    const shipments = this.extractArray(shipmentsStore, ["items", "shipments", "rows", "data", "records", "waybills", "drafts"]);
    const dispatches = this.extractArray(dispatchStore, ["items", "dispatches", "rows", "data", "records", "jobs"]);
    const pods = this.extractArray(podStore, ["items", "deliveries", "pods", "rows", "data", "records"]);
    const invoices = this.extractArray(invoicesStore, ["items", "drafts", "invoices", "rows", "data", "records"]);

    const collection = collections.find((c: AnyRecord) => {
      if (tenantId && !this.sameTenant(c, tenantId)) return false;
      return String(this.primaryId(this.normalizeCollection(c))) === String(collectionId);
    });

    if (!collection) {
      return { ok: false, collectionId, message: `Collection ${collectionId} not found` };
    }

    const normalizedCollection = this.normalizeCollection(collection);
    const nextStatuses = this.mapStatusesFromCollection(normalizedCollection.status);
    const changed: string[] = [];
    const now = new Date().toISOString();

    const reference = this.firstTruthy(
      normalizedCollection.reference,
      normalizedCollection.collectionRef,
      normalizedCollection.collectionNumber,
      normalizedCollection.requestNumber,
      normalizedCollection.waybillNumber,
      normalizedCollection.waybillNo,
      normalizedCollection.trackingNumber,
      normalizedCollection.code,
      collectionId,
    );

    const customerName = this.firstTruthy(
      normalizedCollection.customerName,
      normalizedCollection.clientName,
      normalizedCollection.senderName,
      normalizedCollection.companyName,
      normalizedCollection.accountName,
      "Unknown customer",
    );

    const destination = this.firstTruthy(
      normalizedCollection.destination,
      normalizedCollection.destinationBranch,
      normalizedCollection.destinationCity,
      normalizedCollection.deliveryAddress,
      normalizedCollection.zone,
      normalizedCollection.area,
      "Unknown destination",
    );

    const driverId = this.firstTruthy(
      normalizedCollection.driverId,
      normalizedCollection.driver_id,
      normalizedCollection.assignedDriverId,
    );

    const driverName = this.firstTruthy(
      normalizedCollection.driverName,
      normalizedCollection.assignedDriver,
    );

    let shipment = this.findBestLinkedRecord(normalizedCollection, shipments) ?? undefined;
    if (!shipment) {
      shipment = {
        id: `shipment-${collectionId}`,
        collectionId,
        reference,
        waybillNumber: reference,
        customerName,
        destination,
        status: nextStatuses.shipment,
        driverId: driverId || null,
        driver_id: driverId || null,
        driverName: driverName || null,
        assignedDriver: driverName || null,
        createdAt: now,
        updatedAt: now,
        source: "collections-action-execution-layer",
      };
      shipments.unshift(shipment);
      changed.push("shipment-created");
    } else {
      shipment.status = nextStatuses.shipment;
      shipment.reference = this.firstTruthy(shipment.reference, reference);
      shipment.collectionId = this.firstTruthy(shipment.collectionId, collectionId);
      shipment.customerName = this.firstTruthy(shipment.customerName, customerName);
      shipment.destination = this.firstTruthy(shipment.destination, destination);
      shipment.driverId = this.firstTruthy(shipment.driverId, driverId);
      shipment.driver_id = this.firstTruthy(shipment.driver_id, driverId);
      shipment.driverName = this.firstTruthy(shipment.driverName, driverName);
      shipment.assignedDriver = this.firstTruthy(shipment.assignedDriver, driverName);
      shipment.updatedAt = now;
      changed.push("shipment");
    }

    let dispatch = this.findBestLinkedRecord(normalizedCollection, dispatches) ?? undefined;
    if (!dispatch && (driverId || driverName || nextStatuses.dispatch !== "UNASSIGNED")) {
      dispatch = {
        id: `dispatch-${collectionId}`,
        collectionId,
        reference,
        customerName,
        destination,
        driverId: driverId || null,
        driver_id: driverId || null,
        driverName: driverName || null,
        assignedDriver: driverName || null,
        assignedDriverId: driverId || null,
        status: nextStatuses.dispatch,
        createdAt: now,
        updatedAt: now,
        source: "collections-action-execution-layer",
      };
      dispatches.unshift(dispatch);
      changed.push("dispatch-created");
    } else if (dispatch) {
      dispatch.status = nextStatuses.dispatch;
      dispatch.reference = this.firstTruthy(dispatch.reference, reference);
      dispatch.collectionId = this.firstTruthy(dispatch.collectionId, collectionId);
      dispatch.customerName = this.firstTruthy(dispatch.customerName, customerName);
      dispatch.destination = this.firstTruthy(dispatch.destination, destination);
      dispatch.driverId = this.firstTruthy(dispatch.driverId, driverId);
      dispatch.driver_id = this.firstTruthy(dispatch.driver_id, driverId);
      dispatch.driverName = this.firstTruthy(dispatch.driverName, driverName);
      dispatch.assignedDriver = this.firstTruthy(dispatch.assignedDriver, driverName);
      dispatch.assignedDriverId = this.firstTruthy(dispatch.assignedDriverId, driverId);
      dispatch.updatedAt = now;
      changed.push("dispatch");
    }

    let pod = this.findBestLinkedRecord(normalizedCollection, pods) ?? undefined;
    if (!pod) {
      pod = {
        id: `pod-${collectionId}`,
        collectionId,
        reference,
        customerName,
        destination,
        driverId: driverId || null,
        driver_id: driverId || null,
        driverName: driverName || null,
        assignedDriver: driverName || null,
        status: nextStatuses.pod,
        createdAt: now,
        updatedAt: now,
        source: "collections-action-execution-layer",
      };
      pods.unshift(pod);
      changed.push("pod-created");
    } else {
      pod.status = nextStatuses.pod;
      pod.reference = this.firstTruthy(pod.reference, reference);
      pod.collectionId = this.firstTruthy(pod.collectionId, collectionId);
      pod.customerName = this.firstTruthy(pod.customerName, customerName);
      pod.destination = this.firstTruthy(pod.destination, destination);
      pod.driverId = this.firstTruthy(pod.driverId, driverId);
      pod.driver_id = this.firstTruthy(pod.driver_id, driverId);
      pod.driverName = this.firstTruthy(pod.driverName, driverName);
      pod.assignedDriver = this.firstTruthy(pod.assignedDriver, driverName);
      pod.updatedAt = now;
      changed.push("pod");
    }

    let invoice = this.findBestLinkedRecord(normalizedCollection, invoices) ?? undefined;
    if (!invoice) {
      invoice = {
        id: `invoice-draft-${collectionId}`,
        collectionId,
        reference,
        invoiceNumber: `INV-${collectionId}`,
        customerName,
        destination,
        billingMode: this.firstTruthy(normalizedCollection.billingMode, normalizedCollection.billing_mode, "CONTRACT"),
        payerSide: this.firstTruthy(normalizedCollection.payerSide, normalizedCollection.payer_side, "SENDER"),
        amount: this.firstTruthy(
          normalizedCollection.total,
          normalizedCollection.totalAmount,
          normalizedCollection.amount,
          normalizedCollection.invoiceAmount,
          normalizedCollection.subtotal,
          0,
        ),
        currency: "ZAR",
        status: nextStatuses.invoice,
        createdAt: now,
        updatedAt: now,
        source: "collections-action-execution-layer",
      };
      invoices.unshift(invoice);
      changed.push("invoice-created");
    } else {
      invoice.status = nextStatuses.invoice;
      invoice.reference = this.firstTruthy(invoice.reference, reference);
      invoice.collectionId = this.firstTruthy(invoice.collectionId, collectionId);
      invoice.invoiceNumber = this.firstTruthy(invoice.invoiceNumber, `INV-${collectionId}`);
      invoice.customerName = this.firstTruthy(invoice.customerName, customerName);
      invoice.destination = this.firstTruthy(invoice.destination, destination);
      invoice.billingMode = this.firstTruthy(invoice.billingMode, normalizedCollection.billingMode, normalizedCollection.billing_mode, "CONTRACT");
      invoice.payerSide = this.firstTruthy(invoice.payerSide, normalizedCollection.payerSide, normalizedCollection.payer_side, "SENDER");
      invoice.amount = this.firstTruthy(invoice.amount, normalizedCollection.total, normalizedCollection.amount, 0);
      invoice.currency = this.firstTruthy(invoice.currency, "ZAR");
      invoice.updatedAt = now;
      changed.push("invoice");
    }

    this.writeStore("shipments", shipmentsStore, shipments);
    this.writeStore("dispatch", dispatchStore, dispatches);
    this.writeStore("pod", podStore, pods);
    this.writeStore("invoices", invoicesStore, invoices);

    const auditStore = this.readStore("audit");
    const auditRows = this.extractArray(auditStore, ["items", "rows", "data", "records"]);
    auditRows.unshift({
      id: `${Date.now()}-${collectionId}`,
      collectionId,
      actor,
      changed,
      mappedFromStatus: this.normalizeStatus(normalizedCollection.status),
      mappedTo: nextStatuses,
      createdAt: now,
      type: "SYNC_EXECUTION",
    });
    this.writeStore("audit", auditStore, auditRows);

    return {
      ok: true,
      collectionId,
      actor,
      changed,
      nextStatuses,
      timestamp: now,
      message: `Workflow execution completed for ${collectionId}`,
    };
  }

  private computeDriverSuggestions(collectionId: string, tenantId?: string) {
    const records = this.getRecords(tenantId);
    const target = records.find((r: SyncRecord) => String(r.collectionId) === String(collectionId));

    if (!target) return { ok: false, message: `Collection ${collectionId} not found` };

    const driversStore = this.readStore("drivers");
    const dispatchStore = this.readStore("dispatch");

    const drivers = this.extractArray(driversStore, ["items", "drivers", "rows", "data", "records"]);
    const dispatches = this.extractArray(dispatchStore, ["items", "dispatches", "rows", "data", "records", "jobs"]);

    const existingDispatch = dispatches.find((d: AnyRecord) =>
      String(this.firstTruthy(d.collectionId, d.reference, d.id)) === String(collectionId),
    );

    const scored: DriverSuggestion[] = drivers
      .map((driver: AnyRecord): DriverSuggestion => {
        const activeAssignments = dispatches.filter((d: AnyRecord) => {
          const sameDriver =
            String(this.firstTruthy(d.driverId, d.assignedDriverId, d.driver?.id, d.driverName)) ===
            String(this.firstTruthy(driver.id, driver.driverId, driver.name, driver.fullName));
          const status = this.normalizeStatus(d.status);
          return sameDriver && !["DELIVERED", "COMPLETED", "CLOSED", "CANCELLED"].includes(status);
        }).length;

        const available = this.isDriverAvailable(driver);
        const zoneMatch = this.zoneMatch(target.destination, driver);
        const score =
          (available ? 50 : 0) +
          (zoneMatch ? 25 : 0) +
          Math.max(0, 20 - activeAssignments * 4) +
          (driver.vehicleType ? 5 : 0);

        return {
          id: this.firstTruthy(driver.id, driver.driverId) || driver.name || driver.fullName,
          name: this.firstTruthy(driver.name, driver.fullName) || "Unnamed Driver",
          vehicleType: this.firstTruthy(driver.vehicleType, driver.vehicle, driver.transportMode) || "Unknown",
          activeAssignments,
          available,
          zoneMatch,
          score,
          raw: driver,
        };
      })
      .filter((d: DriverSuggestion) => d.available)
      .sort((a: DriverSuggestion, b: DriverSuggestion) => b.score - a.score);

    return { ok: true, collectionId, target, scored, existingDispatch };
  }

  private normalizeCollection(item: AnyRecord): AnyRecord {
    return {
      ...item,
      id: this.primaryId(item),
      status: this.firstTruthy(item.status, item.collectionStatus, item.requestStatus, "PENDING"),
      reference: this.firstTruthy(
        item.reference,
        item.collectionRef,
        item.collectionNumber,
        item.requestNumber,
        item.waybillNumber,
        item.waybillNo,
        item.trackingNumber,
        item.code,
      ),
    };
  }

  private mapStatusesFromCollection(collectionStatus: string) {
    const status = this.normalizeStatus(collectionStatus);

    if (["NEW", "PENDING", "OPEN", "AWAITING_ASSIGNMENT"].includes(status)) {
      return { shipment: "PENDING_COLLECTION", dispatch: "UNASSIGNED", pod: "AWAITING_COLLECTION", invoice: "DRAFT" };
    }
    if (["ASSIGNED", "SCHEDULED", "READY_FOR_PICKUP"].includes(status)) {
      return { shipment: "SCHEDULED", dispatch: "ASSIGNED", pod: "AWAITING_PICKUP", invoice: "DRAFT" };
    }
    if (["IN_PROGRESS", "COLLECTED", "ON_ROUTE", "OUT_FOR_DELIVERY"].includes(status)) {
      return { shipment: "IN_TRANSIT", dispatch: "IN_PROGRESS", pod: "OUT_FOR_DELIVERY", invoice: "PENDING_BILLING" };
    }
    if (["DELIVERED", "COMPLETED", "CLOSED"].includes(status)) {
      return { shipment: "DELIVERED", dispatch: "COMPLETED", pod: "DELIVERED", invoice: "READY_TO_INVOICE" };
    }
    if (["FAILED", "EXCEPTION"].includes(status)) {
      return { shipment: "EXCEPTION", dispatch: "EXCEPTION", pod: "EXCEPTION", invoice: "ON_HOLD" };
    }
    if (["CANCELLED", "CANCELED"].includes(status)) {
      return { shipment: "CANCELLED", dispatch: "CANCELLED", pod: "CANCELLED", invoice: "VOID" };
    }

    return { shipment: "PENDING_COLLECTION", dispatch: "UNASSIGNED", pod: "AWAITING_COLLECTION", invoice: "DRAFT" };
  }

  private computeAiFlags(
    collection: AnyRecord,
    shipment?: AnyRecord,
    dispatch?: AnyRecord,
    pod?: AnyRecord,
    invoice?: AnyRecord,
    driver?: AnyRecord,
  ) {
    const flags: string[] = [];

    const collectionStatus = this.normalizeStatus(collection?.status);
    const shipmentStatus = this.normalizeStatus(shipment?.status);
    const dispatchStatus = this.normalizeStatus(dispatch?.status);
    const podStatus = this.normalizeStatus(pod?.status);
    const invoiceStatus = this.normalizeStatus(invoice?.status);

    const createdAt = this.parseDate(
      this.firstTruthy(collection?.createdAt, collection?.created_at, collection?.dateCreated),
    );

    if (!driver && ["PENDING", "OPEN", "NEW", "AWAITING_ASSIGNMENT"].includes(collectionStatus)) {
      flags.push("UNASSIGNED");
    }

    if (
      createdAt &&
      Date.now() - createdAt.getTime() > 6 * 60 * 60 * 1000 &&
      ["PENDING", "OPEN", "NEW", "AWAITING_ASSIGNMENT", "ASSIGNED", "SCHEDULED"].includes(collectionStatus)
    ) {
      flags.push("DELAY_RISK");
    }

    if (dispatch && ["ASSIGNED", "IN_PROGRESS"].includes(dispatchStatus) && !driver) {
      flags.push("DISPATCH_DRIVER_MISMATCH");
    }

    if (
      ["DELIVERED", "COMPLETED", "CLOSED"].includes(collectionStatus) &&
      !["READY_TO_INVOICE", "INVOICED", "SENT", "PAID"].includes(invoiceStatus)
    ) {
      flags.push("BILLING_MISMATCH");
    }

    if (
      shipment &&
      ["IN_TRANSIT", "DELIVERED"].includes(shipmentStatus) &&
      ["AWAITING_COLLECTION", "AWAITING_PICKUP"].includes(podStatus)
    ) {
      flags.push("POD_LAG");
    }

    if (driver && !this.isDriverAvailable(driver)) {
      flags.push("DRIVER_OVERLOAD");
    }

    return flags;
  }

  private computePriority(collection: AnyRecord, aiFlags: string[]) {
    const status = this.normalizeStatus(collection?.status);
    if (aiFlags.includes("BILLING_MISMATCH")) return "HIGH";
    if (aiFlags.includes("DELAY_RISK")) return "HIGH";
    if (aiFlags.includes("DISPATCH_DRIVER_MISMATCH")) return "HIGH";
    if (aiFlags.includes("UNASSIGNED") && ["PENDING", "OPEN", "NEW"].includes(status)) return "MEDIUM";
    if (aiFlags.length > 0) return "MEDIUM";
    return "NORMAL";
  }

  private computeSyncHealth(
    statuses: Record<string, string>,
    links: { shipmentLinked: boolean; dispatchLinked: boolean; podLinked: boolean; invoiceLinked: boolean; },
  ) {
    const linkedCount = [links.shipmentLinked, links.dispatchLinked, links.podLinked, links.invoiceLinked].filter(Boolean).length;
    const knownStatusCount = Object.values(statuses).filter(
      (status: string) => !!status && status !== "UNKNOWN",
    ).length;

    if (linkedCount === 0) return "BROKEN";
    if (linkedCount < 4) return "PARTIAL";
    if (knownStatusCount >= 4) return "SYNCED";
    return "PARTIAL";
  }

  private findBestLinkedRecord(collection: AnyRecord, candidates: AnyRecord[]) {
    let best: AnyRecord | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.linkScore(collection, candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return bestScore >= 60 ? best : null;
  }

  private linkScore(collection: AnyRecord, candidate?: AnyRecord) {
    if (!candidate) return 0;

    let score = 0;

    const leftKeys = this.linkKeys(collection);
    const rightKeys = this.linkKeys(candidate);

    const exactKeyMatches = leftKeys.filter((value: string) => rightKeys.includes(value)).length;
    if (exactKeyMatches > 0) score += exactKeyMatches * 60;

    const collectionReference = this.normalizeText(
      this.firstTruthy(
        collection.reference,
        collection.collectionRef,
        collection.collectionNumber,
        collection.requestNumber,
        collection.waybillNumber,
        collection.waybillNo,
        collection.trackingNumber,
        collection.consignmentNumber,
        collection.code,
      ),
    );

    const candidateReference = this.normalizeText(
      this.firstTruthy(
        candidate.reference,
        candidate.collectionRef,
        candidate.collectionNumber,
        candidate.requestNumber,
        candidate.waybillNumber,
        candidate.waybillNo,
        candidate.trackingNumber,
        candidate.trackingNo,
        candidate.consignmentNumber,
        candidate.consignmentNo,
        candidate.code,
        candidate.collectionId,
        candidate.collection_id,
      ),
    );

    if (collectionReference && candidateReference) {
      if (collectionReference === candidateReference) score += 100;
      else if (
        collectionReference.includes(candidateReference) ||
        candidateReference.includes(collectionReference)
      ) {
        score += 55;
      }
    }

    const collectionId = this.normalizeText(
      this.firstTruthy(collection.id, collection.collectionId, collection.collection_id),
    );

    const candidateCollectionId = this.normalizeText(
      this.firstTruthy(candidate.collectionId, candidate.collection_id, candidate.id),
    );

    if (collectionId && candidateCollectionId && collectionId === candidateCollectionId) {
      score += 90;
    }

    const collectionCustomer = this.normalizeText(
      this.firstTruthy(
        collection.customerName,
        collection.clientName,
        collection.senderName,
        collection.companyName,
        collection.accountName,
      ),
    );

    const candidateCustomer = this.normalizeText(
      this.firstTruthy(
        candidate.customerName,
        candidate.clientName,
        candidate.senderName,
        candidate.companyName,
        candidate.accountName,
      ),
    );

    if (collectionCustomer && candidateCustomer) {
      if (this.looseTextEq(collectionCustomer, candidateCustomer)) score += 30;
      else if (this.partialTextMatch(collectionCustomer, candidateCustomer)) score += 18;
    }

    const collectionDestination = this.normalizeText(
      this.firstTruthy(
        collection.destinationBranch,
        collection.destinationCity,
        collection.deliveryAddress,
        collection.zone,
        collection.area,
      ),
    );

    const candidateDestination = this.normalizeText(
      this.firstTruthy(
        candidate.destination,
        candidate.destinationBranch,
        candidate.destinationCity,
        candidate.deliveryAddress,
        candidate.zone,
        candidate.area,
      ),
    );

    if (collectionDestination && candidateDestination) {
      if (this.looseTextEq(collectionDestination, candidateDestination)) score += 25;
      else if (this.partialTextMatch(collectionDestination, candidateDestination)) score += 14;
    }

    const collectionDriver = this.normalizeText(
      this.firstTruthy(
        collection.driverName,
        collection.assignedDriver,
        collection.driverId,
        collection.assignedDriverId,
      ),
    );

    const candidateDriver = this.normalizeText(
      this.firstTruthy(
        candidate.driverName,
        candidate.assignedDriver,
        candidate.driverId,
        candidate.assignedDriverId,
      ),
    );

    if (collectionDriver && candidateDriver) {
      if (collectionDriver === candidateDriver) score += 20;
    }

    return score;
  }

  private isLinked(collection: AnyRecord, candidate?: AnyRecord) {
    return this.linkScore(collection, candidate) >= 60;
  }

  private isRateCardLinked(collection: AnyRecord, rateCard?: AnyRecord) {
    if (!rateCard) return false;
    const collectionClient = this.normalizeText(this.firstTruthy(collection.clientName, collection.customerName, collection.senderName, collection.companyName));
    const rateClient = this.normalizeText(this.firstTruthy(rateCard.clientName, rateCard.customerName, rateCard.accountName, rateCard.companyName));
    const contractA = this.normalizeText(this.firstTruthy(collection.contractCode, collection.contract_code));
    const contractB = this.normalizeText(this.firstTruthy(rateCard.contractCode, rateCard.contract_code));
    return (!!collectionClient && collectionClient === rateClient) || (!!contractA && contractA === contractB);
  }

  private isDriverAssigned(collection: AnyRecord, dispatch: AnyRecord | undefined, driver: AnyRecord) {
    const assignedDriverKeys = [
      this.firstTruthy(collection?.driverId, collection?.driverName, collection?.assignedDriver, collection?.assignedDriverId),
      this.firstTruthy(dispatch?.driverId, dispatch?.driverName, dispatch?.assignedDriver, dispatch?.assignedDriverId),
    ].filter(Boolean).map((value: any) => String(value).trim().toLowerCase());

    const driverKeys = [
      this.firstTruthy(driver?.id, driver?.driverId),
      this.firstTruthy(driver?.name, driver?.fullName),
    ].filter(Boolean).map((value: any) => String(value).trim().toLowerCase());

    return assignedDriverKeys.some((value: string) => driverKeys.includes(value));
  }

  private linkKeys(item?: AnyRecord): string[] {
    return [
      item?.id,
      item?.collectionId,
      item?.collection_id,
      item?.requestId,
      item?.request_id,
      item?.shipmentId,
      item?.shipment_id,
      item?.dispatchId,
      item?.dispatch_id,
      item?.podId,
      item?.pod_id,
      item?.invoiceId,
      item?.invoice_id,
      item?.waybillDraftId,
      item?.waybillDraft_id,
      item?.reference,
      item?.collectionRef,
      item?.collectionNumber,
      item?.requestNumber,
      item?.waybillNumber,
      item?.waybillNo,
      item?.trackingNumber,
      item?.trackingNo,
      item?.consignmentNumber,
      item?.consignmentNo,
      item?.code,
      item?.assignedCollectionId,
      item?.linkedCollectionId,
      item?.linkedReference,
    ]
      .filter(Boolean)
      .map((value: any) => String(value).trim().toLowerCase());
  }

  private looseTextEq(a?: string, b?: string) {
    const left = this.normalizeText(a);
    const right = this.normalizeText(b);
    if (!left || !right) return false;
    return left === right;
  }

  private partialTextMatch(a?: string, b?: string) {
    const left = this.normalizeText(a);
    const right = this.normalizeText(b);
    if (!left || !right) return false;
    return left === right || left.includes(right) || right.includes(left);
  }

  private sameTenant(item: AnyRecord, tenantId?: string) {
    if (!tenantId) return true;
    const itemTenant = this.firstTruthy(item.tenantId, item.tenant_id, item.companyId, item.company_id);
    return String(itemTenant) === String(tenantId);
  }

  private isDriverAvailable(driver: AnyRecord) {
    const status = this.normalizeStatus(this.firstTruthy(driver.status, driver.availability, driver.state, "AVAILABLE"));
    return ["AVAILABLE", "READY", "ONLINE", "ACTIVE"].includes(status);
  }

  private zoneMatch(destination: string, driver: AnyRecord) {
    const destinationText = this.normalizeText(destination);
    const driverText = this.normalizeText(this.firstTruthy(driver.zone, driver.branch, driver.city, driver.baseLocation, ""));
    if (!destinationText || !driverText) return false;
    return destinationText.includes(driverText) || driverText.includes(destinationText);
  }

  private assignmentStatus(currentStatus?: string) {
    const status = this.normalizeStatus(currentStatus);
    if (["DELIVERED", "COMPLETED", "CLOSED", "CANCELLED"].includes(status)) return status;
    return "ASSIGNED";
  }

  private shipmentAssignedStatus(currentStatus?: string) {
    const status = this.normalizeStatus(currentStatus);
    if (["DELIVERED", "COMPLETED", "CLOSED", "CANCELLED"].includes(status)) return status;
    if (["IN_TRANSIT"].includes(status)) return status;
    return "SCHEDULED";
  }

  private normalizeStatus(value?: any) {
    if (!value) return "";
    return String(value).trim().toUpperCase().replace(/\s+/g, "_");
  }

  private normalizeText(value?: any) {
    if (!value) return "";
    return String(value).trim().toLowerCase();
  }

  private primaryId(item: AnyRecord) {
    return this.firstTruthy(
      item.id,
      item.collectionId,
      item.collection_id,
      item.requestId,
      item.request_id,
      item.reference,
      item.collectionRef,
      item.collectionNumber,
      item.requestNumber,
      item.waybillNumber,
      item.waybillNo,
      item.trackingNumber,
      item.code,
    );
  }

  private firstTruthy(...values: any[]) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return null;
  }

  private parseDate(value: any) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private readStore(group: keyof CollectionStateSyncService["storeCandidates"]) {
    const candidates = this.storeCandidates[group];
    for (const file of candidates) {
      const fullPath = path.join(this.dataDir, file);
      if (fs.existsSync(fullPath)) {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
    }
    const fallbackPath = path.join(this.dataDir, candidates[0]);
    const fallbackData = { items: [] as AnyRecord[] };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(fallbackPath, JSON.stringify(fallbackData, null, 2), "utf-8");
    return fallbackData;
  }

  private writeStore(group: keyof CollectionStateSyncService["storeCandidates"], originalStore: any, nextArray: any[]) {
    const candidates = this.storeCandidates[group];
    const targetPath = path.join(this.dataDir, candidates[0]);
    const nextStore = Array.isArray(originalStore) ? nextArray : this.injectArrayBack(originalStore, nextArray);
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(nextStore, null, 2), "utf-8");
  }

  private extractArray(source: any, candidateKeys: string[]) {
    if (Array.isArray(source)) return source;
    if (!source || typeof source !== "object") return [];
    for (const key of candidateKeys) {
      if (Array.isArray(source[key])) return source[key];
    }
    const firstArrayKey = Object.keys(source).find((key: string) => Array.isArray(source[key]));
    if (firstArrayKey) return source[firstArrayKey];
    return [];
  }

  private injectArrayBack(source: any, nextArray: any[]) {
    if (Array.isArray(source)) return nextArray;
    if (!source || typeof source !== "object") return { items: nextArray };
    const preferredKeys = ["items", "rows", "data", "records"];
    for (const key of preferredKeys) {
      if (Array.isArray(source[key])) return { ...source, [key]: nextArray };
    }
    const firstArrayKey = Object.keys(source).find((key: string) => Array.isArray(source[key]));
    if (firstArrayKey) return { ...source, [firstArrayKey]: nextArray };
    return { ...source, items: nextArray };
  }
}

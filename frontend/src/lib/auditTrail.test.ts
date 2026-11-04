import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("../api/client", () => ({ api: { get: mockGet } }));

import {
  actorBucketLabel,
  actorDisplay,
  cleanQuery,
  eventTone,
  evidenceKeys,
  fetchEntityHistory,
  fetchTrail,
  fetchTrailSummary,
  formatTimestamp,
  humanEvent,
  relativeTime,
  statusTransition,
  type TrailRecord,
} from "./auditTrail";

function record(over: Partial<TrailRecord> = {}): TrailRecord {
  return {
    id: "e1",
    kind: "waybill",
    entityId: "wb-1",
    entityReference: "WB-1001",
    event: "COLLECTED",
    status: "COLLECTED",
    fromStatus: null,
    description: "Parcel collected",
    location: "Johannesburg Hub",
    lat: null,
    lng: null,
    actorType: "DRIVER",
    actorId: "drv-1",
    actorName: "Sipho Ndlovu",
    occurredAt: "2026-11-04T08:00:00.000Z",
    evidence: null,
    ...over,
  };
}

describe("fetchTrail", () => {
  beforeEach(() => mockGet.mockReset());

  it("unwraps the TransformInterceptor envelope", async () => {
    mockGet.mockResolvedValue({
      data: { records: [record()], nextCursor: "abc", hasMore: true },
      statusCode: 200,
      message: "success",
    });

    const page = await fetchTrail();
    expect(page.records).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(mockGet).toHaveBeenCalledWith("/audit/trail", { params: {} });
  });

  it("survives a body that is not wrapped", async () => {
    mockGet.mockResolvedValue({ records: [], nextCursor: null, hasMore: false });
    await expect(fetchTrail()).resolves.toEqual({
      records: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("drops empty filters instead of sending them", async () => {
    mockGet.mockResolvedValue({ data: { records: [], nextCursor: null, hasMore: false } });
    await fetchTrail({ kind: "waybill", q: "", actorType: undefined });
    expect(mockGet.mock.calls[0][1].params).toEqual({ kind: "waybill" });
  });

  it("encodes the entity id on the history route", async () => {
    mockGet.mockResolvedValue({ data: [record()] });
    await fetchEntityHistory("waybill", "wb/1");
    expect(mockGet.mock.calls[0][0]).toBe("/audit/trail/waybill/wb%2F1");
  });

  it("returns an empty history rather than undefined", async () => {
    mockGet.mockResolvedValue({ data: null });
    await expect(fetchEntityHistory("consignment", "c1")).resolves.toEqual([]);
  });

  it("requests the summary window", async () => {
    mockGet.mockResolvedValue({ data: { days: 30, total: 0 } });
    await fetchTrailSummary(30);
    expect(mockGet).toHaveBeenCalledWith("/audit/summary", { params: { days: 30 } });
  });
});

describe("cleanQuery", () => {
  it("keeps zero and false-like values that are real inputs", () => {
    expect(cleanQuery({ limit: 0, q: "x" })).toEqual({ limit: 0, q: "x" });
  });
});

describe("actorDisplay", () => {
  it("uses the recorded name", () => {
    expect(actorDisplay(record())).toEqual({
      text: "Sipho Ndlovu",
      detail: null,
      tone: "recorded",
    });
  });

  it("never calls a missing actor System", () => {
    // The old page rendered `changedByName ?? "System"` — inventing an actor
    // for a row that has none. An unresolved id is not a system event.
    const display = actorDisplay(record({ actorName: null, actorId: "drv-gone" }));
    expect(display.text).toBe("Unresolved actor");
    expect(display.tone).toBe("unresolved");
    expect(display.detail).toContain("drv-gone");
    expect(display.text).not.toMatch(/system/i);
  });

  it("shows a recorded actor type when there is no id", () => {
    const display = actorDisplay(record({ actorName: null, actorId: null, actorType: "SYSTEM" }));
    expect(display).toEqual({ text: "System", detail: null, tone: "recorded" });
  });

  it("marks a row with no actor fields as unattributed", () => {
    const display = actorDisplay(
      record({ actorName: null, actorId: null, actorType: null }),
    );
    expect(display.tone).toBe("unattributed");
    expect(display.text).toBe("Unattributed");
  });

  it("says rail events do not record an actor, rather than unattributed", () => {
    // RailConsignmentEvent has no actor column at all. "Nobody did it" and
    // "the source does not record who" must not look the same.
    const display = actorDisplay(
      record({ kind: "consignment", actorName: null, actorId: null, actorType: null }),
    );
    expect(display.tone).toBe("unsupported");
    expect(display.text).toBe("Not recorded");
    expect(display.detail).toMatch(/no actor/);
  });
});

describe("statusTransition", () => {
  it("shows a transition only when both halves are known", () => {
    expect(statusTransition({ fromStatus: "COLLECTED", status: "IN_TRANSIT" })).toBe(
      "COLLECTED → IN_TRANSIT",
    );
    expect(statusTransition({ fromStatus: null, status: "IN_TRANSIT" })).toBe("IN_TRANSIT");
    expect(statusTransition({ fromStatus: "COLLECTED", status: null })).toBe("COLLECTED");
    expect(statusTransition({ fromStatus: null, status: null })).toBeNull();
  });
});

describe("event presentation", () => {
  it("tones failures and completions apart", () => {
    expect(eventTone("DELIVERED")).toBe("positive");
    expect(eventTone("FAILED")).toBe("negative");
    expect(eventTone("IN_TRANSIT")).toBe("neutral");
  });

  it("humanises event codes for display", () => {
    expect(humanEvent("OUT_FOR_DELIVERY")).toBe("Out For Delivery");
  });

  it("labels the summary pseudo-buckets distinctly", () => {
    expect(actorBucketLabel("UNATTRIBUTED")).toBe("Unattributed (waybill events)");
    expect(actorBucketLabel("UNRECORDED_RAIL")).toBe("Rail (no actor recorded)");
    expect(actorBucketLabel("DRIVER")).toBe("Driver");
  });

  it("lists evidence keys without inventing values", () => {
    expect(evidenceKeys(record({ evidence: { epodId: "p1", signatureUrl: "s" } }))).toEqual([
      "epodId",
      "signatureUrl",
    ]);
    expect(evidenceKeys(record({ evidence: null }))).toEqual([]);
  });
});

describe("timestamps", () => {
  it("returns placeholders for an unparseable value", () => {
    expect(formatTimestamp("not-a-date")).toMatchObject({ date: "—", time: "—" });
  });

  it("does not claim a transition for a malformed date", () => {
    const stamp = formatTimestamp("2026-11-04T08:00:00.000Z");
    expect(stamp.date).not.toBe("—");
    expect(stamp.iso).toBe("2026-11-04T08:00:00.000Z");
  });

  it("describes relative age in both directions", () => {
    const now = new Date("2026-11-04T10:00:00.000Z");
    expect(relativeTime(new Date("2026-11-04T09:30:00.000Z"), now)).toBe("30 minutes ago");
    expect(relativeTime(new Date("2026-11-04T10:30:00.000Z"), now)).toBe("in 30 minutes");
    expect(relativeTime(new Date("2026-11-04T09:59:30.000Z"), now)).toBe("just now");
    expect(relativeTime(new Date("2026-11-01T10:00:00.000Z"), now)).toBe("3 days ago");
  });
});

import { buildWaybillTrackWhere } from "./portal-lookup.util";

describe("buildWaybillTrackWhere", () => {
  it("returns null for a whitespace-only phone instead of matching the tenant", () => {
    // The original bug: `?phone=%20%20` normalised to '' and `contains: ''`
    // matched every waybill in the company.
    expect(buildWaybillTrackWhere("acme", { phone: "   " })).toBeNull();
    expect(buildWaybillTrackWhere("acme", { phone: "" })).toBeNull();
    expect(buildWaybillTrackWhere("acme", { phone: "\t\n" })).toBeNull();
  });

  it("returns null when no usable filter is supplied", () => {
    expect(buildWaybillTrackWhere("acme", {})).toBeNull();
    expect(
      buildWaybillTrackWhere("acme", { email: "not-an-email" }),
    ).toBeNull();
  });

  it("rejects very short phone fragments that would match nearly everything", () => {
    expect(buildWaybillTrackWhere("acme", { phone: "0" })).toBeNull();
    expect(buildWaybillTrackWhere("acme", { phone: "12" })).toBeNull();
  });

  it("always scopes to the company", () => {
    const where = buildWaybillTrackWhere("acme", {
      phone: "0825551234",
    }) as any;
    expect(where.companyId).toBe("acme");
  });

  it("builds a tracking-number lookup when a tracking number is given", () => {
    const where = buildWaybillTrackWhere("acme", {
      tracking: " FO-123 ",
      phone: "0825551234",
    }) as any;
    expect(where.trackingNumber).toBe("FO-123");
    // A specific tracking number wins: no OR branch that could widen results.
    expect(where.OR).toBeUndefined();
  });

  it("matches phone on sender and recipient, with whitespace removed", () => {
    const where = buildWaybillTrackWhere("acme", {
      phone: " 082 555 1234 ",
    }) as any;
    expect(where.OR).toEqual([
      { senderPhone: { contains: "0825551234" } },
      { recipientPhone: { contains: "0825551234" } },
    ]);
  });

  it("matches email exactly and case-insensitively, never partially", () => {
    const where = buildWaybillTrackWhere("acme", {
      email: " Client@Example.com ",
    }) as any;
    expect(where.OR).toEqual([
      { recipientEmail: { equals: "Client@Example.com", mode: "insensitive" } },
    ]);
  });

  it("requires a company id", () => {
    expect(buildWaybillTrackWhere("", { phone: "0825551234" })).toBeNull();
  });
});

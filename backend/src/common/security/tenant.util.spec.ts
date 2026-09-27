import { withCompanyId } from "./tenant.util";

describe("withCompanyId", () => {
  it("ignores a client-supplied companyId and keeps the session tenant", () => {
    // The warehouse bug: `data: { companyId, ...dto }` let the body win.
    expect(
      withCompanyId("tenant-a", { name: "Depot", companyId: "tenant-b" }),
    ).toEqual({
      name: "Depot",
      companyId: "tenant-a",
    });
  });

  it("strips other server-owned fields", () => {
    const result = withCompanyId("tenant-a", {
      id: "spoofed",
      createdAt: "2000-01-01",
      updatedAt: "2000-01-01",
      sku: "SKU-1",
    });
    expect(result).toEqual({ sku: "SKU-1", companyId: "tenant-a" });
  });

  it("handles missing or empty bodies", () => {
    expect(withCompanyId("tenant-a")).toEqual({ companyId: "tenant-a" });
    expect(withCompanyId("tenant-a", null)).toEqual({ companyId: "tenant-a" });
    expect(withCompanyId("tenant-a", {})).toEqual({ companyId: "tenant-a" });
  });

  it("never mutates the caller’s object", () => {
    const body = { name: "Depot", companyId: "tenant-b" };
    withCompanyId("tenant-a", body);
    expect(body.companyId).toBe("tenant-b");
  });

  it("preserves falsy but legitimate values", () => {
    expect(withCompanyId("t", { active: false, note: null, count: 0 })).toEqual(
      {
        active: false,
        note: null,
        count: 0,
        companyId: "t",
      },
    );
  });
});

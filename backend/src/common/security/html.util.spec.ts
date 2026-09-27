import {
  escapeHtml,
  safeCssColor,
  safeHexForSuffix,
  safeUrl,
} from "./html.util";

describe("escapeHtml", () => {
  it("neutralises a script payload stored in tenant data", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes quote and backtick characters so attributes cannot be broken out of", () => {
    // The quote is escaped, so the payload cannot break out of the attribute.
    // Spaces are left alone — unnecessary inside a quoted attribute.
    expect(escapeHtml(`" onmouseover="alert(1)`)).toBe(
      "&quot; onmouseover&#61;&quot;alert(1)",
    );
    expect(escapeHtml("`")).toBe("&#96;");
  });

  it("escapes the equals sign to prevent attribute injection", () => {
    expect(escapeHtml("a=b")).toBe("a&#61;b");
  });

  it("handles null, undefined and non-string input without throwing", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
    expect(escapeHtml(42.5)).toBe("42.5");
  });

  it("escapes ampersands first so it is not double-encoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("safeCssColor", () => {
  it("accepts plain hex colours", () => {
    expect(safeCssColor("#10b981")).toBe("#10b981");
    expect(safeCssColor("#fff")).toBe("#fff");
  });

  it("rejects CSS that would break out of the declaration", () => {
    // The classic injection: terminate the value and add a new declaration.
    expect(safeCssColor("red;background:url(//evil.test/x)")).toBe("#10b981");
    expect(safeCssColor("#10b981; } body { display: none")).toBe("#10b981");
    expect(safeCssColor("url(javascript:alert(1))")).toBe("#10b981");
  });

  it("rejects non-string and unexpected values, falling back", () => {
    expect(safeCssColor(undefined)).toBe("#10b981");
    expect(safeCssColor({ toString: () => "#123456" })).toBe("#10b981");
    expect(safeCssColor("", "#000000")).toBe("#000000");
  });

  it("accepts a small allowlist of keywords", () => {
    expect(safeCssColor("transparent")).toBe("transparent");
    expect(safeCssColor("RED")).toBe("RED");
    expect(safeCssColor("expression(alert(1))")).toBe("#10b981");
  });
});

describe("safeHexForSuffix", () => {
  it("returns bare hex when another hex suffix will be appended", () => {
    expect(safeHexForSuffix("#10b981")).toBe("10b981");
  });

  it("rejects values that would break the concatenated colour", () => {
    expect(safeHexForSuffix("#10b981;background:red")).toBe("10b981");
    expect(safeHexForSuffix("red")).toBe("10b981");
  });
});

describe("safeUrl", () => {
  it("allows http(s) and escapes the result", () => {
    expect(safeUrl("https://cdn.test/a.png")).toBe("https://cdn.test/a.png");
    // '=' and '&' are entity-encoded; browsers decode them, so the link still
    // resolves, but the value cannot terminate the attribute.
    expect(safeUrl("http://cdn.test/a.png?a=1&b=2")).toBe(
      "http://cdn.test/a.png?a&#61;1&amp;b&#61;2",
    );
  });

  it("rejects javascript: and other schemes", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<script>")).toBe("");
    expect(safeUrl("")).toBe("");
    expect(safeUrl(undefined)).toBe("");
  });
});

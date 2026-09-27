/**
 * HTML escaping for server-rendered pages (public invoice, portal views).
 *
 * These pages interpolate tenant-controlled data (invoice line descriptions,
 * company names, brand colours) into an HTML/CSS template. Without escaping,
 * a tenant can store markup that executes when the page is opened — including
 * on the unauthenticated public share link, which makes it a phishing vector.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
};

/** Escape text for use in element content or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`=]/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Brand colours are interpolated into CSS (e.g. `color:${accent}`) and into
 * inline styles, so escaping alone is not enough: `red;background:url(...)` is
 * valid CSS and would break out of the intended declaration. Only accept a
 * plain hex colour or a small set of safe CSS colour keywords; anything else
 * falls back to the default.
 */
const SAFE_CSS_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_KEYWORDS = new Set([
  "transparent",
  "inherit",
  "initial",
  "currentcolor",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "gray",
  "grey",
  "orange",
  "purple",
  "teal",
  "navy",
  "maroon",
]);

export function safeCssColor(value: unknown, fallback = "#10b981"): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (SAFE_CSS_COLOR.test(candidate)) return candidate;
  if (SAFE_KEYWORDS.has(candidate.toLowerCase())) return candidate;
  return fallback;
}

/**
 * A hex colour used to build translucent variants (`${accent}22`). Only six-
 * digit hex (optionally with alpha) is safe to concatenate with more hex.
 */
export function safeHexForSuffix(value: unknown, fallback = "10b981"): string {
  const candidate = String(value ?? "")
    .trim()
    .replace(/^#/, "");
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(candidate)
    ? candidate
    : fallback;
}

/** Escape a value used inside a URL, rejecting anything that is not http(s). */
export function safeUrl(value: unknown): string {
  const candidate = String(value ?? "").trim();
  if (/^https?:\/\//i.test(candidate)) return escapeHtml(candidate);
  return "";
}

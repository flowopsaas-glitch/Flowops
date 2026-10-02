import { Transform } from 'class-transformer';

/**
 * Keep the value exactly as the client sent it, so `@IsString()` can reject a
 * non-string.
 *
 * Why: the global ValidationPipe runs with `enableImplicitConversion: true`
 * (main.ts), which makes class-transformer coerce a value to the property's
 * declared type BEFORE validation. An object sent for a `string` property
 * becomes the string "[object Object]" and sails through `@IsString()`.
 * Use this on string fields whose content reaches an LLM, a query or a log.
 */
export const RawString = () => Transform(({ obj, key }) => obj?.[key]);

/**
 * Same idea for booleans. With `enableImplicitConversion` the STRING "false" becomes `true`
 * (`Boolean("false")`), as do "no", "0" and `{}` — so a client that sends `"false"` would silently
 * switch a flag ON (a dangerous-goods declaration, a "planned occupation" that waives a refund, an
 * "agree" on a disputed deviation). With this transform only a real JSON `true` / `false` passes
 * `@IsBoolean()`.
 */
export const RawBoolean = () => Transform(({ obj, key }) => obj?.[key]);

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

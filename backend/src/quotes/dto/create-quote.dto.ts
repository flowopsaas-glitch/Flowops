import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Payload for creating a quote.
 *
 * A validated DTO class rather than `@Body() body: any`, for the same reason
 * as `general-average.dto.ts`: an untyped body erases to `Object`, so the
 * global ValidationPipe has no metatype, `whitelist` has nothing to strip
 * against, and raw JSON reaches the service.
 *
 * That was not theoretical here. With `body: any`, a negative weight produced a
 * quote of −R1420 and a weight of 0 produced a breakdown that did not add up to
 * the price it was explaining (see #512). The service now defends itself at
 * runtime and is tested; this DTO is the outer layer, so the rejection happens
 * at the edge with a 400 naming the field, instead of inside the money maths.
 *
 * `weight` stays validated in the service as well. Two layers, because the
 * service is called from places other than this controller and a guard at only
 * one end is a guard someone will route around.
 */
export class CreateQuoteDto {
  @IsString()
  @IsNotEmpty()
  fromAddress: string;

  @IsString()
  @IsNotEmpty()
  toAddress: string;

  /**
   * Kilograms. `transform: true` plus @Type coerces the string a form field
   * arrives as; @Min(0) rejects a negative weight at the edge.
   */
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  weight: number;

  @IsOptional()
  @IsString()
  clientName?: string | null;
}

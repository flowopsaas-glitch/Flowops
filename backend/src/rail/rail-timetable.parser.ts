import { BadRequestException } from '@nestjs/common';

export const RAIL_SCHEDULE_COLUMN_COUNT = 19;
export const MAX_RAIL_SCHEDULE_ROWS = 300_000;
export const MAX_RAIL_SCHEDULE_FIELD_BYTES = 64 * 1024;
export const MAX_RAIL_SCHEDULE_ROW_BYTES = MAX_RAIL_SCHEDULE_FIELD_BYTES * RAIL_SCHEDULE_COLUMN_COUNT + (RAIL_SCHEDULE_COLUMN_COUNT - 1);
export const MAX_RAIL_SCHEDULE_PHYSICAL_LINES = MAX_RAIL_SCHEDULE_ROWS + 10_000;

export interface ParsedRailScheduleRow {
  sourceRow: number;
  origin: string;
  train: string;
  nodeSequence: number | null;
  corridor: string | null;
  station: string;
  arrivalTime: string | null;
  departureTime: string | null;
  pointToPointRuntime: string | null;
  standingTime: string | null;
  standingReason: string | null;
  destination: string | null;
  originDepartureTime: string | null;
  destinationArrivalTime: string | null;
  scheduleCode: string | null;
  frequency: string | null;
  trainType: string | null;
  throughputRuntime: string | null;
  departDay: number | null;
  distanceKm: number | null;
  rawLine: string;
}

function decodeText(buffer: Buffer): string {
  let text: string;
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    text = buffer.subarray(2).toString('utf16le');
  } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = Buffer.from(buffer.subarray(2));
    for (let i = 0; i + 1 < body.length; i += 2) {
      const first = body[i];
      body[i] = body[i + 1];
      body[i + 1] = first;
    }
    text = body.toString('utf16le');
  } else {
    text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  }
  if (text.includes('\uFFFD')) {
    throw new BadRequestException('The timetable file is not valid UTF-8/UTF-16 text');
  }
  return text;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function optionalInteger(value: string): number | null {
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function optionalDecimal(value: string): number | null {
  const normalized = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const HEADER_START = ['origin', 'train', 'node_seq'];

/**
 * Iterate validated Annexure 33a rows without materializing an object for every
 * line. The source text is bounded by the upload cap; row objects remain in the
 * caller's small database-write batches only.
 */
export function* iterateRailScheduleRows(buffer: Buffer): Generator<ParsedRailScheduleRow> {
  const text = decodeText(buffer);
  let lineStart = 0;
  let lineIndex = 0;
  let firstNonEmptyLine: number | null = null;
  let dataRow = 0;

  // Walk the decoded text in place rather than split()'ing up to 25 MiB into
  // millions of strings for newline-heavy input. The source file itself is
  // already bounded by the upload route; parser overhead stays proportional to
  // the current row and yielded database batch, not the number of blank lines.
  while (true) {
    if (lineIndex >= MAX_RAIL_SCHEDULE_PHYSICAL_LINES) {
      throw new BadRequestException(
        `Timetable import cannot exceed ${MAX_RAIL_SCHEDULE_PHYSICAL_LINES} physical lines`,
      );
    }

    const newlineIndex = text.indexOf('\n', lineStart);
    const hasNewline = newlineIndex !== -1;
    const lineEnd = hasNewline ? newlineIndex : text.length;
    const stripCarriageReturn = hasNewline && lineEnd > lineStart && text.charCodeAt(lineEnd - 1) === 13;
    const rawLine = text.slice(lineStart, lineEnd - (stripCarriageReturn ? 1 : 0));

    if (Buffer.byteLength(rawLine, 'utf8') > MAX_RAIL_SCHEDULE_ROW_BYTES) {
      throw new BadRequestException(
        `Timetable row ${lineIndex + 1} exceeds the ${MAX_RAIL_SCHEDULE_ROW_BYTES}-byte row limit`,
      );
    }

    if (rawLine.trim()) {
      if (firstNonEmptyLine === null) firstNonEmptyLine = lineIndex;
      const columns = rawLine.split('\t');

      if (
        lineIndex === firstNonEmptyLine &&
        columns.length === RAIL_SCHEDULE_COLUMN_COUNT &&
        HEADER_START.every((header, index) => columns[index].trim().toLowerCase().replace(/\s+/g, '_') === header)
      ) {
        // A header is structural, not a data field; it is included in the
        // general row-byte ceiling above but not the per-column schema check.
      } else {
        if (columns.length !== RAIL_SCHEDULE_COLUMN_COUNT) {
          throw new BadRequestException(
            `Invalid timetable row ${lineIndex + 1}: expected ${RAIL_SCHEDULE_COLUMN_COUNT} tab-separated columns, received ${columns.length}`,
          );
        }

        for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
          if (Buffer.byteLength(columns[columnIndex], 'utf8') > MAX_RAIL_SCHEDULE_FIELD_BYTES) {
            throw new BadRequestException(
              `Invalid timetable row ${lineIndex + 1}: column ${columnIndex + 1} exceeds the ${MAX_RAIL_SCHEDULE_FIELD_BYTES}-byte field limit`,
            );
          }
        }

        const values = columns.map((column) => column.trim());
        if (!values[0] || !values[1] || !values[4]) {
          throw new BadRequestException(
            `Invalid timetable row ${lineIndex + 1}: origin, train, and station are required`,
          );
        }
        dataRow += 1;
        if (dataRow > MAX_RAIL_SCHEDULE_ROWS) {
          throw new BadRequestException(`Timetable import cannot exceed ${MAX_RAIL_SCHEDULE_ROWS} rows`);
        }

        yield {
          sourceRow: dataRow,
          origin: values[0],
          train: values[1],
          nodeSequence: optionalInteger(values[2]),
          corridor: optionalText(values[3]),
          station: values[4],
          arrivalTime: optionalText(values[5]),
          departureTime: optionalText(values[6]),
          pointToPointRuntime: optionalText(values[7]),
          standingTime: optionalText(values[8]),
          standingReason: optionalText(values[9]),
          destination: optionalText(values[10]),
          originDepartureTime: optionalText(values[11]),
          destinationArrivalTime: optionalText(values[12]),
          scheduleCode: optionalText(values[13]),
          frequency: optionalText(values[14]),
          trainType: optionalText(values[15]),
          throughputRuntime: optionalText(values[16]),
          departDay: optionalInteger(values[17]),
          distanceKm: optionalDecimal(values[18]),
          rawLine,
        };
      }
    }

    if (!hasNewline) break;
    lineStart = newlineIndex + 1;
    lineIndex += 1;
    if (lineStart === text.length) break; // a terminal newline does not add an extra physical row
  }

  if (dataRow === 0) {
    throw new BadRequestException('Timetable file contains no schedule rows');
  }
}

export function* parseRailScheduleBatches(
  buffer: Buffer,
  batchSize: number,
): Generator<ParsedRailScheduleRow[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new BadRequestException('Timetable batch size must be a positive integer');
  }
  let batch: ParsedRailScheduleRow[] = [];
  for (const row of iterateRailScheduleRows(buffer)) {
    batch.push(row);
    if (batch.length === batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

/** Backward-compatible convenience API for small callers and parser tests. */
export function parseRailSchedule(buffer: Buffer): ParsedRailScheduleRow[] {
  return Array.from(iterateRailScheduleRows(buffer));
}

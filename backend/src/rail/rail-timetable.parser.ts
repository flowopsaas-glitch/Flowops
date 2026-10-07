import { BadRequestException } from '@nestjs/common';

export const RAIL_SCHEDULE_COLUMN_COUNT = 19;
export const MAX_RAIL_SCHEDULE_ROWS = 300_000;

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
 * Parse Annexure 33a tab-separated rows. Raw source lines are retained so
 * unusual values, blanks, and schedule-day offsets remain auditable.
 */
export function parseRailSchedule(buffer: Buffer): ParsedRailScheduleRow[] {
  const text = decodeText(buffer);
  const lines = text.split(/\r?\n/);
  const rows: ParsedRailScheduleRow[] = [];
  const firstNonEmptyLine = lines.findIndex((line) => line.trim().length > 0);
  let dataRow = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    if (!rawLine.trim()) continue;
    const columns = rawLine.split('\t');

    if (
      lineIndex === firstNonEmptyLine &&
      columns.length === RAIL_SCHEDULE_COLUMN_COUNT &&
      HEADER_START.every((header, index) => columns[index].trim().toLowerCase().replace(/\s+/g, '_') === header)
    ) {
      continue;
    }

    if (columns.length !== RAIL_SCHEDULE_COLUMN_COUNT) {
      throw new BadRequestException(
        `Invalid timetable row ${lineIndex + 1}: expected ${RAIL_SCHEDULE_COLUMN_COUNT} tab-separated columns, received ${columns.length}`,
      );
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

    rows.push({
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
    });
  }

  if (rows.length === 0) {
    throw new BadRequestException('Timetable file contains no schedule rows');
  }
  return rows;
}

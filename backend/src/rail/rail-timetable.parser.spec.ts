import { BadRequestException } from '@nestjs/common';
import { parseRailSchedule } from './rail-timetable.parser';

const makeRow = (overrides: Record<number, string> = {}) => {
  const cells = Array.from({ length: 19 }, () => '');
  cells[0] = 'BELLVILLE';
  cells[1] = '1417';
  cells[2] = '1';
  cells[3] = 'CAPE';
  cells[4] = 'BELLVILLE';
  cells[6] = '03:15:00';
  cells[10] = 'WOLSELEY';
  cells[11] = '03:15:00';
  cells[12] = '05:55:30';
  cells[13] = '3';
  cells[14] = 'YYYYYYY';
  cells[15] = 'LIGHTAIRBRAKE/CONTAINER TRN';
  cells[16] = '02:40:00';
  cells[17] = '0';
  cells[18] = '0';
  for (const [index, value] of Object.entries(overrides)) cells[Number(index)] = value;
  return cells.join('\t');
};

const HEADER = [
  'Origin', 'Train', 'NODE_Seq', 'ENROUTE_Corridor', 'ENRTE_Station/siding number',
  'ENROUTE_Arrival time', 'ENROUTE_Departure Time', 'Point to Point Runtime',
  'Standingtime', 'StandingReason', 'Destination', 'Origin Departure Time',
  'Destination Arrival Time', 'Sched', 'Frequency', 'Train Type',
  'Train Throughput Runtime (from Origin to Destination)', 'Depart_Day', 'Distance',
].join('\t');

describe('parseRailSchedule', () => {
  it('parses Annexure 33a rows and preserves varying corridors and day offsets', () => {
    const first = makeRow({ 2: '1', 3: 'CAPE', 17: '1', 18: '2.79' });
    const second = makeRow({ 2: '1', 3: 'ORELINE', 4: 'SALKOR', 6: '00:00:00', 17: '2', 18: '23' });
    const rows = parseRailSchedule(Buffer.from(`${HEADER}\r\n${first}\r\n${second}\r\n`, 'utf8'));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceRow: 1,
      origin: 'BELLVILLE',
      train: '1417',
      corridor: 'CAPE',
      departDay: 1,
      distanceKm: 2.79,
      rawLine: first,
    });
    expect(rows[1]).toMatchObject({
      sourceRow: 2,
      corridor: 'ORELINE',
      station: 'SALKOR',
      departureTime: '00:00:00',
      departDay: 2,
      distanceKm: 23,
    });
  });

  it('preserves meaningful blank and free-text source fields', () => {
    const row = makeRow({ 3: '', 7: '', 8: '', 9: 'ORDER &amp; SHUNT', 18: '' });
    const [parsed] = parseRailSchedule(Buffer.from(row, 'utf8'));
    expect(parsed.corridor).toBeNull();
    expect(parsed.pointToPointRuntime).toBeNull();
    expect(parsed.standingTime).toBeNull();
    expect(parsed.standingReason).toBe('ORDER &amp; SHUNT');
    expect(parsed.distanceKm).toBeNull();
    expect(parsed.rawLine).toBe(row);
  });

  it('supports UTF-16LE timetable exports', () => {
    const row = makeRow({ 17: '2' });
    const input = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(row, 'utf16le')]);
    expect(parseRailSchedule(input)[0].departDay).toBe(2);
  });

  it('rejects rows with the wrong column count and reports their source line', () => {
    expect(() => parseRailSchedule(Buffer.from(`${HEADER}\nBELLVILLE\t1417\n`)))
      .toThrow(new BadRequestException('Invalid timetable row 2: expected 19 tab-separated columns, received 2'));
  });

  it('rejects empty files', () => {
    expect(() => parseRailSchedule(Buffer.from('\r\n\t \r\n')))
      .toThrow(new BadRequestException('Timetable file contains no schedule rows'));
  });
});

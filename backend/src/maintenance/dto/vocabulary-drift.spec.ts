import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ASSET_CLASSES,
  ASSET_METER_TYPES,
  ASSET_STATUSES,
  COST_KINDS,
  JOB_STATUSES,
  JOB_TYPES,
} from './maintenance.dto';

/**
 * The DTO vocabularies must equal the Prisma enums, exactly and in order.
 *
 * A class that exists in the schema but not in `@IsIn(...)` is rejected by
 * validation with "assetClass must be one of the following values" — which
 * reads like a client bug and is actually a list that fell out of step. That is
 * how a straddle carrier ends up unregisterable while the database column
 * happily accepts it.
 *
 * This is a static read of `prisma/schema.prisma`, so it needs no database and
 * fails in the same run as the rest of the module's tests.
 */
const SCHEMA = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'), 'utf8');

function enumValues(name: string): string[] {
  const match = new RegExp(`^enum ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(SCHEMA);
  if (!match) throw new Error(`enum ${name} not found in schema.prisma`);
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

describe('maintenance vocabularies match the schema', () => {
  it.each([
    ['AssetClass', ASSET_CLASSES],
    ['AssetMeterType', ASSET_METER_TYPES],
    ['AssetStatus', ASSET_STATUSES],
    ['MaintenanceJobType', JOB_TYPES],
    ['MaintenanceJobStatus', JOB_STATUSES],
    ['MaintenanceCostKind', COST_KINDS],
  ])('%s', (enumName, dtoValues) => {
    expect([...dtoValues]).toEqual(enumValues(enumName as string));
  });

  it('includes the classes a container terminal actually runs', () => {
    // Named explicitly, not because the equality test above would miss them,
    // but so a future tidy-up cannot quietly drop the plant this was built for.
    expect(ASSET_CLASSES).toContain('STRADDLE_CARRIER');
    expect(ASSET_CLASSES).toContain('HAULER');
    expect(ASSET_CLASSES).toContain('RTG');
  });
});

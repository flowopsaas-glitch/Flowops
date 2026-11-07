/**
 * The screen's role lists against the server's own decorators.
 *
 * The maintenance page decides which buttons exist from the card's status *and*
 * the reader's role. That second half exists because of a real defect: the page
 * used to offer "Complete job" and "Record step" to a dispatcher, who filled in
 * six dates and was refused by the API. The UI was promising what the server had
 * already decided against.
 *
 * The client keeps its own copies of the role sets (`MAINTENANCE_MANAGER_ROLES`
 * and friends in `frontend/src/lib/maintenance.ts`) because a browser cannot
 * import a Nest decorator. A mirror that is never checked is a mirror that
 * drifts — and the drift would only ever show up as a 403 in somebody's hand.
 *
 * So this test reads both files and compares. It lives in the backend rather
 * than the frontend because the frontend's tsconfig deliberately has no
 * `@types/node` and Vite denies reads outside its root; here, `fs` is available
 * and the decorator — the thing the client is mirroring — is also the thing
 * being read.
 *
 * Deliberately dumb: no TypeScript parser, just the published text. If either
 * file is restructured beyond recognition the test fails loudly rather than
 * passing vacuously, which is what you want from a guard.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONTROLLER = resolve(__dirname, 'maintenance.controller.ts');
const CLIENT_LIB = resolve(__dirname, '../../../frontend/src/lib/maintenance.ts');

const controllerSource = readFileSync(CONTROLLER, 'utf8');
const clientSource = readFileSync(CLIENT_LIB, 'utf8');

/** The roles attached to `@Post('<route>')` in the controller. */
function controllerRoles(route: string): string[] {
  const at = controllerSource.indexOf(`@Post('${route}')`);
  if (at < 0) throw new Error(`the controller no longer declares POST ${route}`);

  // The decorator block runs from the route to the handler. Reading a fixed
  // window and taking the FIRST @Roles is correct because @Roles directly
  // follows every route decorator in this controller.
  const block = controllerSource.slice(at, at + 600);
  const decorator = block.match(/@Roles\(([\s\S]*?)\)/);
  if (!decorator) throw new Error(`POST ${route} has no @Roles decorator — rbac:check should have caught this`);

  return (decorator as RegExpMatchArray)[1]
    .split(',')
    .map((token) => token.replace(/UserRole\./g, '').replace(/\s/g, ''))
    .filter(Boolean)
    .sort();
}

/** The string literals of an exported `const NAME = [...] as const` array. */
function clientRoles(name: string): string[] {
  const match = clientSource.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`));
  if (!match) throw new Error(`${name} is missing from the client library`);

  return (match as RegExpMatchArray)[1]
    .split(',')
    .map((token) => token.replace(/["'\s]/g, ''))
    .filter(Boolean)
    .sort();
}

describe('the maintenance screen offers only what the API accepts', () => {
  it('agrees on who may record the quotation, order and payment dates', () => {
    expect(clientRoles('MAINTENANCE_MANAGER_ROLES')).toEqual(controllerRoles('jobs/:id/commercial'));
  });

  it('agrees on who may complete, sign off and cancel — one manager set for all four', () => {
    // A single client constant covers all four manager actions only while the
    // controller really does use the same list for each. If it ever splits
    // them, this fails and the client has to split too.
    for (const route of ['jobs/:id/complete', 'jobs/:id/sign-off', 'jobs/:id/cancel']) {
      expect(controllerRoles(route)).toEqual(clientRoles('MAINTENANCE_MANAGER_ROLES'));
    }
  });

  it('agrees on who may raise a card, start work and add a cost', () => {
    expect(controllerRoles('jobs')).toEqual(clientRoles('MAINTENANCE_JOB_WRITER_ROLES'));
    expect(controllerRoles('jobs/:id/start')).toEqual(clientRoles('MAINTENANCE_JOB_WRITER_ROLES'));
    expect(controllerRoles('jobs/:id/costs')).toEqual(clientRoles('MAINTENANCE_JOB_WRITER_ROLES'));
  });

  it('agrees on who may add a unit to the register', () => {
    expect(controllerRoles('assets')).toEqual(clientRoles('MAINTENANCE_ASSET_WRITER_ROLES'));
  });

  it('keeps the warehouse inside the cards and outside the register', () => {
    // The one asymmetry that looks like a bug and is not: a warehouse clerk may
    // raise and work a card but may not add a machine to the register. Asserted
    // on the SERVER's lists, so the client mirror above cannot quietly turn a
    // deliberate decision into an accident.
    expect(controllerRoles('jobs')).toContain('WAREHOUSE');
    expect(controllerRoles('assets')).not.toContain('WAREHOUSE');
  });
});

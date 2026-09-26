/**
 * Jest module shim for the offline (WASM) engine path.
 *
 * `@prisma/client/wasm` loads its engine through `#wasm-engine-loader`, whose
 * default implementation is `export default import('./query_engine_bg.wasm')`.
 * Bundlers turn that into a `WebAssembly.Module`; plain Node returns a module
 * namespace without a `default`, which makes the runtime report
 *
 *   "The loaded wasm module was unexpectedly `undefined` or `null` once loaded"
 *
 * The Prisma runtime accepts any lazily-resolved module — it only needs
 * `new WebAssembly.Instance(module, { './query_engine_bg.js': glue })` to work —
 * so this shim supplies the module straight from disk.
 *
 * Wired up only by `test/jest-integration.json` (moduleNameMapper). It has no
 * effect on the native-engine path CI uses, and nothing in `src/` references
 * it: the application itself is untouched.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GENERATED_CLIENT_DIR } from './prisma-client';

const actual = jest.requireActual('@prisma/client/runtime/wasm.js') as Record<string, unknown>;

const WASM_ENGINE_PATH = path.join(GENERATED_CLIENT_DIR, 'query_engine_bg.wasm');

const originalGetPrismaClient = actual.getPrismaClient as (config: any) => unknown;

function getPrismaClientWithNodeWasmLoader(config: any): unknown {
  const engineWasm = (config.engineWasm ?? {}) as { getRuntime?: () => unknown };

  config.engineWasm = {
    getRuntime:
      engineWasm.getRuntime ??
      (() => require(path.join(GENERATED_CLIENT_DIR, 'query_engine_bg.js'))),
    getQueryEngineWasmModule: async () => {
      if (!fs.existsSync(WASM_ENGINE_PATH)) {
        throw new Error(
          `The generated wasm engine is missing at ${WASM_ENGINE_PATH}. Run \`npx prisma generate\` ` +
            'in backend/ first.',
        );
      }
      return new WebAssembly.Module(fs.readFileSync(WASM_ENGINE_PATH));
    },
  };

  return originalGetPrismaClient(config);
}

// `Object.create` keeps every other runtime export reachable through the
// prototype chain while replacing just this one.
const patched = Object.create(actual);
Object.defineProperty(patched, 'getPrismaClient', {
  value: getPrismaClientWithNodeWasmLoader,
  enumerable: true,
});

module.exports = patched;

// Copies the built driver-portal web app into ./www so Capacitor can bundle it.
//
// By default it reads ../driver-portal/dist (the layout on the FlowOps box:
//   ~/FlowOps-Logistics/driver-portal/dist  ->  ~/FlowOps-Logistics/driver-mobile/www
// Override with DRIVER_WEB_DIST=/abs/path/to/dist.
import { existsSync, rmSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const src = resolve(process.env.DRIVER_WEB_DIST || '../driver-portal/dist');
const dest = resolve('www');

if (!existsSync(src)) {
  console.error(`\n[prepare-web] ✗ Source web build not found:\n    ${src}\n`);
  console.error('Point DRIVER_WEB_DIST at your built driver portal, e.g.:');
  console.error('    DRIVER_WEB_DIST=~/FlowOps-Logistics/driver-portal/dist npm run sync\n');
  process.exit(1);
}
if (!existsSync(join(src, 'index.html'))) {
  console.error(`[prepare-web] ✗ ${src} has no index.html — is it a built web app (run its build first)?`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// Neutralise the service worker inside the native shell. A SW is pointless in a
// packaged app (assets are already local) and can intercept navigation/caching
// in the webview. Replace any sw.js with a self-unregistering no-op.
const sw = join(dest, 'sw.js');
if (existsSync(sw)) {
  writeFileSync(
    sw,
    "self.addEventListener('install',()=>self.skipWaiting());\n" +
      "self.addEventListener('activate',(e)=>{self.registration.unregister();" +
      "e.waitUntil(self.clients.claim());});\n",
  );
  console.log('[prepare-web] • Neutralised service worker for native shell');
}

const count = readFileSync(join(dest, 'index.html'), 'utf8').length;
console.log(`[prepare-web] ✓ Copied ${src}\n             -> ${dest} (index.html ${count} bytes)`);
console.log('[prepare-web] Next: npx cap sync  (or it runs automatically via npm run sync)');

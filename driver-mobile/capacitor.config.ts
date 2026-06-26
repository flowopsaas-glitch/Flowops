import type { CapacitorConfig } from '@capacitor/cli';

/**
 * FlowOps Driver — native app shell.
 *
 * We wrap the ALREADY-BUILT driver-portal web app (copied into ./www by
 * scripts/prepare-web.mjs). The web app talks to https://api.flowop.work, and
 * the CapacitorHttp plugin routes fetch/XHR through the native HTTP stack so
 * there are NO CORS issues from the capacitor://localhost webview origin.
 */
const config: CapacitorConfig = {
  appId: 'work.flowop.driver',
  appName: 'FlowOps Driver',
  webDir: 'www',
  // Use https scheme on Android so secure-context APIs (geolocation, camera,
  // service workers) behave like the production PWA.
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Route all JS network calls (fetch/axios) through native HTTP — bypasses
    // browser CORS for the absolute https://api.flowop.work calls.
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#020817',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020817',
    },
  },
};

export default config;

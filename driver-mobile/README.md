# FlowOps Driver — Native Apps (Capacitor)

Turns the existing **FlowOps Driver PWA** into real **iOS and Android apps** for the
App Store and Google Play — by wrapping the already-built web app with
[Capacitor](https://capacitorjs.com/). No rewrite: the same UI your drivers use
at `driver.flowop.work` runs inside a native shell, talking to
`https://api.flowop.work`.

This closes the "native mobile driver app" gap vs incumbents like Parcel Perfect
and CourierMate (both of which ship native driver apps).

```
~/FlowOps-Logistics/
├── driver-portal/        # the built web app (dist/) — source of the web assets
│   └── dist/
└── driver-mobile/        # THIS project — the Capacitor native wrapper
```

## How it works

1. `scripts/prepare-web.mjs` copies `../driver-portal/dist` → `./www`.
2. Capacitor bundles `./www` into the native `android/` and `ios/` projects.
3. The web app's network calls (to `https://api.flowop.work`) are routed through
   the **CapacitorHttp** plugin, so there are no CORS problems from the native
   webview origin.

> The `www/`, `android/`, `ios/` and `node_modules/` folders are generated and
> git-ignored — you create them locally with the steps below.

## Prerequisites

- **Node 18+**
- **Android:** Android Studio (with an SDK + a device/emulator), JDK 17
- **iOS:** macOS + Xcode + CocoaPods (`sudo gem install cocoapods`)
- A **built** driver portal at `../driver-portal/dist` (you already have this).
  If you rebuild it, just re-run `npm run sync`.

## First-time setup

```bash
cd ~/FlowOps-Logistics/driver-mobile
npm install

# Copy the built web app into ./www and create native projects
npm run prepare:web
npm run add:android      # creates android/
npm run add:ios          # creates ios/   (macOS only)
```

If your built web app lives elsewhere, point the script at it:

```bash
DRIVER_WEB_DIST=/absolute/path/to/driver-portal/dist npm run prepare:web
```

## App icons & splash (uses your FlowOps logo)

Drop a 1024×1024 PNG logo at `resources/icon.png` (and optionally
`resources/splash.png`), then:

```bash
npx @capacitor/assets generate --iconBackgroundColor "#020817" --splashBackgroundColor "#020817"
```

This generates every required icon/splash size for both platforms.

## Build & run

```bash
# Android — opens Android Studio (Run ▶ to a device/emulator)
npm run open:android

# iOS — opens Xcode (Run ▶ to a simulator/device)   [macOS only]
npm run open:ios
```

`open:*` runs `prepare:web` + `cap sync` first, so the latest web build is always
bundled. To rebuild after changing the web app:

```bash
npm run sync          # re-copies dist + syncs into native projects
```

## Shipping to the stores

**Android (Play Store)**
1. In Android Studio: *Build → Generate Signed Bundle / APK → Android App Bundle (.aab)*.
2. Create/choose an upload keystore (keep it safe — it's how Google verifies you).
3. Upload the `.aab` in the Play Console.

**iOS (App Store)**
1. In Xcode: set your Apple Developer **Team** + a unique bundle id (matches
   `appId` = `work.flowop.driver`).
2. *Product → Archive → Distribute App → App Store Connect*.

## Native capabilities included

The following Capacitor plugins are wired in `package.json` for driver workflows:

| Plugin | Used for |
|---|---|
| `@capacitor/geolocation` | live driver GPS / route tracking |
| `@capacitor/camera` | POD photo capture |
| `@capacitor/status-bar` | dark status bar matching the app theme |
| `@capacitor/splash-screen` | branded launch screen |
| `@capacitor/network` | offline awareness |
| `@capacitor/app` | deep links / app lifecycle |

> Permissions: Android auto-merges plugin permissions. For iOS, add usage
> strings in `ios/App/App/Info.plist` — `NSLocationWhenInUseUsageDescription`,
> `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription` — or the App
> Store will reject the build.

## Configuration reference

- App id: `work.flowop.driver`
- App name: `FlowOps Driver`
- Web assets: `./www` (copied from `../driver-portal/dist`)
- Backend: `https://api.flowop.work` (baked into the web build; no config here)
- See `capacitor.config.ts` for splash/status-bar/HTTP settings.

## Push notifications (optional, later)

To add push: `npm i @capacitor/push-notifications`, register the device token on
login, and have the backend send via FCM (Android) / APNs (iOS). Not included
here to keep the first release simple.

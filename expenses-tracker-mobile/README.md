# Expenses Tracker — Mobile App (Expo / React Native)

A **fully offline-first** native iOS + Android app built with **Expo SDK 55 + React Native 0.83 +
React Native Paper v5**. It **never talks to [`expenses-tracker-api`](../expenses-tracker-api/README.md)**
— all state lives in a local SQLite database, and multi-device convergence happens through the user's
own Google Drive `appDataFolder` or OneDrive `approot`.

> **Where this module fits.** The mobile app is independent of the web frontend and backend. It ports
> the same **event-sourcing + CQRS** model and sync engine to TypeScript so the on-device behavior is
> identical to the backend's Kotlin implementation. For the cross-cutting **Sync Engine Architecture**,
> the **sync file format**, and the **mobile sync TypeScript port** (including the
> *Automatic Sync Triggers, Throttling, and Bandwidth* subsection), see the
> [root README](../README.md#-sync-engine-architecture).
>
> The mobile module is a Gradle subproject (`./gradlew :expenses-tracker-mobile:check` runs lint +
> Vitest + type-check) so it participates in the same monorepo build as the backend and web frontend.

---

## 📑 Table of Contents

- [Expenses Tracker — Mobile App (Expo / React Native)](#expenses-tracker--mobile-app-expo--react-native)
  - [📑 Table of Contents](#-table-of-contents)
  - [🎯 Overview](#-overview)
  - [🛠 Tech Stack](#-tech-stack)
  - [🚀 Running the Mobile App](#-running-the-mobile-app)
    - [Quick start](#quick-start)
    - [Setting up a simulator / emulator](#setting-up-a-simulator--emulator)
      - [Option 1 — Physical device with Expo Go (easiest, any OS)](#option-1--physical-device-with-expo-go-easiest-any-os)
      - [Option 2 — Android emulator (Windows / macOS / Linux)](#option-2--android-emulator-windows--macos--linux)
        - [Recommended AVD configuration (stability)](#recommended-avd-configuration-stability)
          - [Host-level tips (Windows)](#host-level-tips-windows)
          - [If the AOSP emulator still misbehaves](#if-the-aosp-emulator-still-misbehaves)
      - [Option 3 — iOS Simulator (macOS only)](#option-3--ios-simulator-macos-only)
    - [Verifying the setup](#verifying-the-setup)
  - [🔧 Building a Local Dev Client (`npx expo run:android`)](#-building-a-local-dev-client-npx-expo-runandroid)
  - [📦 Building \& Sideloading a Production APK](#-building--sideloading-a-production-apk)
    - [Which EAS profile to use](#which-eas-profile-to-use)
    - [One-time setup](#one-time-setup)
    - [Option A — Cloud build via EAS (recommended, works from Windows with zero extra tooling)](#option-a--cloud-build-via-eas-recommended-works-from-windows-with-zero-extra-tooling)
    - [Option B — Local cloud-free build (`--local` flag)](#option-b--local-cloud-free-build---local-flag)
    - [Option C — Pure Gradle (skip EAS entirely)](#option-c--pure-gradle-skip-eas-entirely)
    - [Installing the APK on your phone](#installing-the-apk-on-your-phone)
    - [Practical notes](#practical-notes)
  - [🔐 Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids)
    - [Microsoft (OneDrive)](#microsoft-onedrive)
    - [Google (Google Drive)](#google-google-drive)
    - [Will other users be able to use my app registration?](#will-other-users-be-able-to-use-my-app-registration)
      - [Who can sign in — the "Supported account types" setting](#who-can-sign-in--the-supported-account-types-setting)
      - ["Unverified publisher" warning](#unverified-publisher-warning)
    - [How the `expensestracker://redirect` URI actually works](#how-the-expensestrackerredirect-uri-actually-works)
      - [1. The app *claims* the scheme at install time](#1-the-app-claims-the-scheme-at-install-time)
      - [2. Microsoft *records* the redirect URI as a plain string](#2-microsoft-records-the-redirect-uri-as-a-plain-string)
      - [The handoff](#the-handoff)
      - [Why this is secure](#why-this-is-secure)
      - [Common failure modes (and what they confirm about the model)](#common-failure-modes-and-what-they-confirm-about-the-model)
    - [Are these Client IDs sensitive?](#are-these-client-ids-sensitive)
  - [📦 Mobile Note (`expo-sqlite`)](#-mobile-note-expo-sqlite)
  - [📄 Key Files](#-key-files)
  - [📚 Related Documentation](#-related-documentation)

---

## 🎯 Overview

The mobile app:

- Runs entirely on-device — **no backend dependency**. The entire data layer (event store, projection
  table, idempotency registry) lives in `expo-sqlite`.
- Implements the same **event-sourced, CQRS** model as the backend: append-only `expense_events`,
  materialized `expense_projections`, idempotent `processed_events`. The TypeScript projector mirrors
  the Kotlin one byte-for-byte at the conflict-resolution layer (strict `>` last-write-wins).
- Syncs across the user's devices via a **shared sync file** in their own cloud drive:
  Google Drive `appDataFolder` or OneDrive `approot`. The sync file is gzip-compressed JSON, **byte-identical
  to the backend's `SyncFileManager` output**.
- Uses **OAuth 2.0 + PKCE** with no client secret for cloud-drive authentication
  ([Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids)).
- Has a single `AutoSyncCoordinator` that funnels every sync trigger (cold start, foreground, after-write
  debounce, app-background flush, network reconnect, manual button) and enforces a 30 s minimum gap
  between auto-syncs — see the
  [Automatic Sync Triggers, Throttling, and Bandwidth subsection in the root README](../README.md#mobile-sync-typescript-port).

The path-scoped Copilot rules for this module live in
[`.github/instructions/expenses-tracker-mobile.instructions.md`](../.github/instructions/expenses-tracker-mobile.instructions.md).

---

## 🛠 Tech Stack

- **Expo SDK 55** + **React Native 0.83** + **React 19.2**
- **TypeScript** (strict + `verbatimModuleSyntax` + `exactOptionalPropertyTypes`)
- **React Native Paper v5** — Material 3 component library
- **Expo Router** — file-based routing with typed routes
- **expo-sqlite** — local event store + projection + idempotency registry (port of the backend's three tables)
- **TanStack Query** — wraps the local store, mirroring the web frontend's data-fetching layer
- **expo-auth-session** — OAuth 2.0 + PKCE for Google Drive / OneDrive (no client secret)
- **expo-secure-store** — Keychain (iOS) / Keystore (Android) for tokens
- **expo-background-fetch** + **expo-task-manager** — periodic sync when the app is backgrounded
- **pako** — gzip encode/decode of `sync.json.gz` (byte-identical to the backend's `SyncFileManager` output)
- **i18next** + **react-i18next** — locale JSON copied at build time from the web frontend
- **Vitest** — pure-TypeScript unit tests for `src/domain/`, `src/sync/`, and `src/test/` (56+ tests)

---

## 🚀 Running the Mobile App

> **Three runtime modes — pick one based on what you want to do.**
>
> **Expo Go** is a free app from the App Store / Google Play that can load *any* Expo project's JS
> bundle without compiling native code. You don't ship Expo Go to end users — it's a developer
> sandbox. The catch is that Expo Go only ships a fixed set of native modules; a project can only
> run inside Expo Go if its native dependencies are a subset of what Expo Go bundles.
>
> This app uses `expo-sqlite` (bundled with Expo Go ✅) plus `expo-auth-session` and
> `expo-secure-store` for cloud-drive OAuth (also bundled ✅) **but** OAuth requires a custom URI
> scheme (`expensestracker://redirect`) that Expo Go cannot register. The practical effect is:
>
> | Mode            | How to launch                                                                                   | Works for                                  | Doesn't work for          |
> |-----------------|-------------------------------------------------------------------------------------------------|--------------------------------------------|---------------------------|
> | **Expo Go**     | `npm start`, scan QR in Expo Go                                                                 | UI, local SQLite, all offline behaviour    | Cloud-drive OAuth sign-in |
> | **Dev client**  | [`npx expo run:android`](#-building-a-local-dev-client-npx-expo-runandroid) (full native build) | Everything, with hot reload                | —                         |
> | **Release APK** | [`eas build --profile preview`](#-building--sideloading-a-production-apk) or Option C (Gradle)  | Everything, optimised; install on a phone  | Hot reload                |
>
> Iterate in Expo Go for JS-only work. Switch to a dev client whenever you need to test cloud-drive
> sign-in or any other custom-scheme feature. Build a release APK only when you want a sideloadable
> install for a phone.

### Quick start

```bash
cd expenses-tracker-mobile

# First-time install (no special flags needed)
npm install

# Run the standard checks (lint + Vitest + tsc)
npm run lint
npm run typecheck
npm test

# Start the Expo dev server (requires a simulator or a physical device)
npm start
```

When `npm start` is running, press:

- `a` — open on Android emulator (or connected device)
- `i` — open on iOS Simulator (macOS only)
- `w` — open in a web browser (limited; not the supported target)
- scan the QR code with the **Expo Go** app on a physical device

### Setting up a simulator / emulator

You have three options for running the app during development. Pick whichever fits your OS.

#### Option 1 — Physical device with Expo Go (easiest, any OS)

1. Install **Expo Go** from the [App Store](https://apps.apple.com/app/expo-go/id982107779) (iOS) or
   [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) (Android).
2. Connect the phone to the **same Wi-Fi network** as your dev machine.
3. Run `npm start` and scan the QR code printed in the terminal (iOS: Camera app; Android: Expo Go's
   built-in scanner).

> Expo Go is fine for the JS-only parts of this app, but **OAuth via `expo-auth-session` and
> `expo-secure-store` need a custom dev client**. For full cloud-drive sync testing on a physical
> device, build a dev client with `npx eas build --profile development --platform <android|ios>`
> and install the resulting `.apk` / `.ipa`.

#### Option 2 — Android emulator (Windows / macOS / Linux)

1. Install **[Android Studio](https://developer.android.com/studio)**. During the setup wizard,
   make sure **Android SDK**, **Android SDK Platform-Tools**, and **Android Virtual Device** are
   selected.
2. Open Android Studio → **More Actions → Virtual Device Manager → Create Device**. Pick a phone
   profile (e.g. Pixel 7) and a recent system image (API 34 / Android 14 recommended). Download
   the image if prompted, then **Finish**.
3. Set the `ANDROID_HOME` environment variable and add platform-tools to `PATH`:
    - **Windows (PowerShell, persistent — writes the User registry directly, idempotent):**
      ```powershell
      $sdk = "$env:LOCALAPPDATA\Android\Sdk"
      Set-ItemProperty -Path 'HKCU:\Environment' -Name 'ANDROID_HOME' -Value $sdk

      $userPath = (Get-ItemProperty -Path 'HKCU:\Environment' -Name 'Path' -ErrorAction SilentlyContinue).Path
      $entries  = if ($userPath) { $userPath -split ';' | Where-Object { $_ -ne '' } } else { @() }
      foreach ($p in @("$sdk\platform-tools", "$sdk\emulator")) {
          if ($entries -notcontains $p) { $entries += $p }
      }
      Set-ItemProperty -Path 'HKCU:\Environment' -Name 'Path' -Value ($entries -join ';') -Type ExpandString
      ```
      Open a **new terminal** afterwards so it picks up the updated `Path`.

      > Why the registry directly? `[Environment]::SetEnvironmentVariable(..., 'User')`
      > broadcasts a `WM_SETTINGCHANGE` message to every top-level window and can hang for
      > minutes if any of them is unresponsive. Writing `HKCU:\Environment` is instant and
      > equivalent for new processes.
    - **macOS / Linux (`~/.zshrc` or `~/.bashrc`):**
      ```bash
      export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS
      # export ANDROID_HOME="$HOME/Android/Sdk"         # Linux
      export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
      ```
4. Verify the toolchain:
   ```bash
   adb --version
   emulator -list-avds
   ```
5. Start the emulator (from Android Studio's Device Manager, or `emulator -avd <name>`), run
   `npm start` from `expenses-tracker-mobile/`, and press `a`.

> Hardware acceleration matters: on Windows enable **Hyper-V** or **WHPX** (Android Studio
> installs WHPX automatically); on Intel Macs use **HAXM**; on Apple Silicon use the bundled
> ARM64 system image; on Linux make sure your user is in the `kvm` group.

##### Recommended AVD configuration (stability)

The default AVD wizard picks values tuned for "smallest possible footprint", not "stable for
daily dev work". The Android Studio emulator is notoriously fragile on Windows; the settings
below eliminate the most common crash / freeze causes. Pick these explicitly when creating
the device (or **Edit Device** an existing one — then **Wipe Data** so the new values take
effect instead of being shadowed by the old userdata image).

| Setting                   | Default      | Recommended                                             | Why                                                                                                                                                                                                      |
|---------------------------|--------------|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Device profile**        | Pixel 9 / 10 | **Pixel 7**                                             | Most battle-tested profile; what most Expo / RN guides assume.                                                                                                                                           |
| **API level**             | Latest       | **34** (Android 14)                                     | Expo SDK 55 / RN 0.83 cap `targetSdk` at 35. Preview API images (37+) are explicitly unstable.                                                                                                           |
| **Services**              | Google Play  | **Google APIs**                                         | The Play image runs Play Services + Play Store auto-updaters in the background — #1 cause of random freezes. You don't need Play Store for `npx expo run:android`.                                       |
| **ABI**                   | x86_64       | **x86_64** (Intel/AMD) or **arm64-v8a** (Apple Silicon) | Match the host architecture exactly.                                                                                                                                                                     |
| **Preferred ABI**         | Optimal      | **x86_64** (or arm64-v8a)                               | "Optimal" lets the emulator translate cross-arch binaries via `libndk_translation`. Translation is slow *and* a known crash source. Force the host arch to disable it.                                   |
| **Default boot**          | Quick        | **Cold**                                                | Quick boot uses a snapshot; snapshot restore is the #1 source of "started, then froze" and "Metro can't connect" reports. Cold boots take 20–40 s but are far more reliable.                             |
| **Graphics acceleration** | Automatic    | **Hardware — GLES 2.0**                                 | "Automatic" sometimes picks ANGLE-on-D3D on Windows and crashes on driver updates. Explicit is deterministic. (Fall back to **SwiftShader / software** if you get GPU crashes — slower but bulletproof.) |
| **RAM**                   | 1.5–2 GB     | **4 GB**                                                | 2 GB is heavily swap-bound on API 34; apps get killed under memory pressure and the emulator surfaces it as "process terminated".                                                                        |
| **VM heap size**          | 228 MB       | **512 MB**                                              | API-24 era default. Hermes + debugger needs 384+ MB; OOM kills look like emulator crashes.                                                                                                               |
| **CPU cores**             | 2            | **4**                                                   | Don't exceed half your host's physical cores.                                                                                                                                                            |
| **Internal storage**      | 2 GB         | **6 GB**                                                | RN dev clients + Metro cache + a couple of APK rebuilds fill 2 GB fast.                                                                                                                                  |

After clicking **Finish**: right-click the AVD → **Wipe Data**. Without this the existing
userdata image keeps the old RAM / heap settings.

###### Host-level tips (Windows)

These matter at least as much as the AVD settings themselves:

- **Exclude the AVD + SDK directories from Windows Defender real-time scanning** —
  `%USERPROFILE%\.android\avd\` and `%LOCALAPPDATA%\Android\Sdk\`. Defender locking the qcow2
  disk image mid-write produces a silent *"emulator process terminated"* with no useful log.
- **Don't run Docker Desktop and the emulator at the same time** unless Docker is fully on
  the WSL2 backend — both want the Hyper-V hypervisor, and the loser crashes.
- **Keep emulator + platform-tools current** — `sdkmanager --update`. Pre-33.x emulator
  binaries crash on Windows 11 24H2.

###### If the AOSP emulator still misbehaves

Three escalation paths in order of effort:

1. **Physical Android device over USB** (gold standard). Enable Developer Options →
   USB Debugging, connect, then `adb reverse tcp:8081 tcp:8081` so Metro speaks to the
   device over USB regardless of Wi-Fi. Restarting the phone is far cheaper than restarting
   an emulator.
2. **Genymotion Personal** (free for non-commercial use). Runs on VirtualBox instead of
   WHPX / Hyper-V and is dramatically more stable on Windows. Pairs cleanly with Android
   Studio's `adb`.
3. **EAS preview build + same physical device** — `npx eas build --profile preview
   --platform android`, install the APK. Useful for reproducing release-mode bugs.

#### Option 3 — iOS Simulator (macOS only)

1. Install **[Xcode](https://apps.apple.com/app/xcode/id497799835)** from the Mac App Store
   (large download, ~10 GB).
2. Open Xcode once and accept the license, then install the command-line tools:
   ```bash
   sudo xcode-select --install
   sudo xcodebuild -license accept
   ```
3. Install a simulator runtime: **Xcode → Settings → Platforms → iOS → Get** (or **+** to pick a
   specific version). iOS 17+ is recommended.
4. (Optional but recommended) install Watchman for faster Metro file watching:
   ```bash
   brew install watchman
   ```
5. Verify:
   ```bash
   xcrun simctl list devices
   ```
6. Run `npm start` from `expenses-tracker-mobile/` and press `i`. Expo will boot the default
   simulator and install the app.

> iOS Simulator is **not available on Windows or Linux** — there is no legal way to run it
> outside macOS. From a Windows machine, use the Android emulator locally and rely on
> `npx eas build --platform ios` (cloud build) when you need an iOS artifact.

### Verifying the setup

After starting `npm start`, the Metro bundler should print something like:

```
› Metro waiting on exp://192.168.1.42:8081
› Press a │ open Android
› Press i │ open iOS simulator
```

If `a` reports "No Android connected device found", run `adb devices` — the emulator should
appear as `emulator-5554   device`. If it shows `unauthorized`, accept the USB-debugging prompt
on the device; if it shows `offline`, cold-boot the emulator from Android Studio's Device
Manager.

To produce installable builds via EAS (Expo Application Services):

```bash
# Android (works from Windows / macOS / Linux — cloud build by default)
npx eas build --platform android --profile preview

# iOS (requires an Apple developer account and either macOS or EAS cloud)
npx eas build --platform ios --profile preview
```

---

## 🔧 Building a Local Dev Client (`npx expo run:android`)

`npm start` + Expo Go covers most JS-only work, but features that need native modules
(cloud-drive OAuth, `expo-secure-store`, background sync) require a **dev client** built
locally. From `expenses-tracker-mobile/`:

```bash
npx expo run:android   # generates android/, runs Gradle, installs APK on device/emulator
```

This invokes the full Android NDK + CMake + Kotlin/Gradle pipeline and has three host-level
prerequisites beyond the SDK / emulator setup above.

**1. JDK 17–21 (NOT JDK 22+)** — AGP 8.12 (bundled with Expo SDK 55 / RN 0.83) only supports
JDK 17–21. On JDK 22+ the CMake configure tasks fail with
`WARNING: A restricted method in java.lang.System has been called`. Microsoft Build of OpenJDK
21 LTS, Eclipse Temurin 21, Azul Zulu 21, Android Studio's bundled JBR 21 all work. Set
`JAVA_HOME` to the JDK 21 install root and reopen your terminal. The backend uses Gradle
toolchains (`gradle/libs.versions.toml: java = "21"`) and is unaffected by the global JDK.

**2. Windows: enable Win32 long path support** — RN's autolinked CMake codegen embeds
absolute source paths inside the build directory, producing object-file paths of ~380 chars.
The default Windows MAX_PATH of 260 will fail the build with
`ninja: error: Stat(...): Filename longer than 260 characters`. Two steps are needed:

- Set the registry flag once (admin / UAC required):
  ```powershell
  Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command',
    "Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' LongPathsEnabled 1 -Type DWord"
  ```
- Enable long-path support in git as well (no admin):
  ```powershell
  git config --global core.longpaths true
  ```

**3. Windows: replace Android SDK's bundled `ninja.exe`** — the registry flag is necessary
but **not sufficient**: each process must also declare `longPathAware` in its application
manifest. The `ninja.exe` shipped with Android SDK `cmake/3.22.1/` is version 1.10.2 (2020)
and lacks that manifest entry, so Windows continues to enforce MAX_PATH on it regardless of
the registry. Replace it with ninja 1.11+ (kitware-built binaries from
[ninja-build releases](https://github.com/ninja-build/ninja/releases)):

```powershell
$bin = "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin"
Copy-Item "$bin\ninja.exe" "$bin\ninja.exe.bak"
Invoke-WebRequest 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip' `
  -OutFile "$env:TEMP\ninja-win.zip"
Expand-Archive "$env:TEMP\ninja-win.zip" -DestinationPath "$env:TEMP\ninja" -Force
Copy-Item "$env:TEMP\ninja\ninja.exe" "$bin\ninja.exe" -Force
```

Verify with:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin\ninja.exe" --version   # should print 1.12.1+
```

After changing any of the above, clean stale CMake artifacts before the next build:

```powershell
cd expenses-tracker-mobile\android
Remove-Item -Recurse -Force app\.cxx, app\build -ErrorAction SilentlyContinue
.\gradlew.bat --stop
```

> macOS / Linux are unaffected by points 2 and 3 — their filesystems have no 260-char limit.
> The JDK version requirement (point 1) applies to every host OS.

---

## 📦 Building & Sideloading a Production APK

This section covers building a release-mode `.apk` and installing it directly on an Android phone
(no Play Store involved).

### Which EAS profile to use

[`eas.json`](./eas.json) ships three build profiles, but **only `preview` produces a directly-installable
APK**:

| Profile       | Output             | Distribution                                 | Use for                                        |
|---------------|--------------------|----------------------------------------------|------------------------------------------------|
| `development` | `.apk` (dev client)| `internal`                                   | Local dev with `expo-dev-client` + Metro       |
| `preview`     | `.apk`             | `internal`                                   | **Sideloading a release build onto your phone**|
| `production`  | `.aab`             | `store` (Google Play default)                | Submitting to the Play Store                   |

The `production` profile defaults to Android App Bundle (AAB) which Google Play repackages per device —
you can't install an AAB by tapping it. So the standard "give me a production-quality APK I can
sideload" answer is `preview`. It applies the same release-mode optimizations (R8/ProGuard, Hermes
bytecode, no debug overlay) as `production`; the only differences are the output format and the
auto-increment of `versionCode`.

### One-time setup

> **Applicability:** Steps 1 and 2 are required for **Option A** and **Option B** — both use the EAS
> CLI (the `--local` flag only changes *where* the build runs, not *who* orchestrates it). Only
> **Option C** (pure Gradle) bypasses EAS entirely and lets you skip them. Step 3 applies to **all
> three options** because it's about runtime OAuth, not about how the APK is built.

**1. Free Expo account + CLI login** *(Options A & B):*

```powershell
cd expenses-tracker-mobile
npx eas login          # opens a browser; sign up at https://expo.dev if you don't have an account
npx eas whoami         # verify
```

**2. Link the project to an EAS project ID** *(Options A & B)* — on first build EAS writes
`extra.eas.projectId` into [`app.json`](./app.json); accept the prompt and commit the change:

```powershell
npx eas project:init
```

**3. Configure OAuth client IDs** *(all options)* so cloud-drive sync works in the release build —
see the next section
[Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids). Skipping
this step still produces a working app, but Google Drive / OneDrive sign-in will fail until real
client IDs are wired in.

> **Already set during development?** If you wired in `GOOGLE_OAUTH_CLIENT_ID` /
> `MICROSOFT_OAUTH_CLIENT_ID` earlier (for example while testing
> [`npx expo run:android`](#-building-a-local-dev-client-npx-expo-runandroid)), there is nothing
> extra to do here — the values are already committed to the source tree and the bundler will inline
> them into the release APK automatically. Skip this step.

### Option A — Cloud build via EAS (recommended, works from Windows with zero extra tooling)

```powershell
cd expenses-tracker-mobile
npx eas build --platform android --profile preview
```

This uploads the source tarball to Expo's build servers (10–15 min). EAS prints a build URL and a QR
code; both lead to the finished `.apk`.

> **First-ever build for this `package` (`com.vshpynta.expensestracker`):** EAS prompts to generate a
> release keystore and stores it in your Expo account. **Don't lose that account** — every future
> upgrade of the same app must be signed with the same keystore, or Android will refuse to install
> over the existing one. Run `npx eas credentials` to back the keystore up locally if you care about
> long-term recoverability.

### Option B — Local cloud-free build (`--local` flag)

```powershell
cd expenses-tracker-mobile
npx eas build --platform android --profile preview --local
```

This runs the same pipeline as Option A on **your** machine — no Expo cloud round-trip. Requires
everything the [`expo run:android`](#-building-a-local-dev-client-npx-expo-runandroid) section
already documents:

- **JDK 17–21** (not 22+) with `JAVA_HOME` pointed at it.
- Android SDK (platform 34+), NDK 27.x, and CMake 3.22+ — all installable through Android Studio's
  SDK Manager.
- **Windows only**: long-path support enabled (registry flag + git config + Ninja override). See the
  three host-level prerequisites under the `expo run:android` section.

Output is a single `build-<timestamp>.apk` written to `expenses-tracker-mobile/` itself.

### Option C — Pure Gradle (skip EAS entirely)

This path uses only Node, Expo's `prebuild` codegen, and the Android Gradle toolchain — no EAS
account, no `eas-cli`. Use it when you want a fully offline, EAS-free build pipeline.

**Prerequisites** — same host setup as the dev-client section
[Building a Local Dev Client (`npx expo run:android`)](#-building-a-local-dev-client-npx-expo-runandroid).
You need **all three** host-level requirements documented there:

1. **JDK 17–21** with `JAVA_HOME` pointed at it (not JDK 22+).
2. **Android SDK** (platform 34+), **NDK 27.x**, and **CMake 3.22+** — install via Android Studio's
   SDK Manager. Make sure `ANDROID_HOME` is set and `%ANDROID_HOME%\platform-tools` is on `PATH`.
3. **Windows only:** Win32 long-path support enabled (registry + `git config core.longpaths true`)
   and the bundled `ninja.exe` replaced with 1.12+ — full instructions in the dev-client section.

**Build steps:**

**1. Install npm dependencies:**

```powershell
cd expenses-tracker-mobile
npm install
```

**2. Generate the native `android/` project** (Expo writes `android/` from `app.json` + the installed
Expo modules; `--clean` discards any previous prebuild so the output is reproducible):

```powershell
npx expo prebuild --platform android --clean
```

**3. Build the release APK with Gradle:**

```powershell
cd android
.\gradlew.bat assembleRelease
```

(On macOS / Linux use `./gradlew assembleRelease`.)

**4. APK output:**

```
expenses-tracker-mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install it on your phone using the steps in
[Installing the APK on your phone](#installing-the-apk-on-your-phone).

> **Cloud-drive sync is configured separately**, not as part of the build. If you skip the OAuth
> client IDs (step 3 of [One-time setup](#one-time-setup)), the APK still builds and the app runs
> normally — only Google Drive / OneDrive sign-in fails at runtime. The full walkthrough is in
> [Cloud-Drive Sync — Getting OAuth Client IDs](#-cloud-drive-sync--getting-oauth-client-ids).

> **The default APK is ~100 MB — this is normal**, and easy to shrink. `assembleRelease` produces a
> single **universal APK** that bundles native `.so` libraries for all four Android ABIs
> (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) listed in
> [`android/gradle.properties`](./android/gradle.properties) (`reactNativeArchitectures=...`). Each
> ABI carries its own copy of Hermes, the React Native core, and every native module
> (`expo-sqlite`, `expo-secure-store`, `expo-auth-session`, `react-native-svg`, …), so the native
> code is duplicated 4×.
>
> For sideloading onto a real phone, build for `arm64-v8a` only (every Android device from the last
> ~7 years) — APK drops to **~30–40 MB**:
>
> ```powershell
> .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
> ```
>
> Use `x86_64` instead for an Android emulator on an x86 PC. The Google Play Store solves this
> automatically via AAB splits; sideloading does not, which is why the unrestricted APK is large.

> **Default signing is the debug keystore** — fine for personal sideloading on a phone you own, but
> not suitable for anyone else's device or for upgrading an EAS-built APK. For a real release keystore,
> generate one with `keytool` and wire it in via `android/gradle.properties`
> (`MYAPP_UPLOAD_STORE_FILE`, `MYAPP_UPLOAD_KEY_ALIAS`, `MYAPP_UPLOAD_STORE_PASSWORD`,
> `MYAPP_UPLOAD_KEY_PASSWORD`). Expo's docs cover this end-to-end:
> [`Manually configuring Android signing`](https://docs.expo.dev/app-signing/local-credentials/#android-credentials).

### Installing the APK on your phone

**Over USB (fastest if `adb` is already on your `PATH`)**

```powershell
adb install -r path\to\app-release.apk    # -r = reinstall, preserve app data
```

`adb` lives in `%ANDROID_HOME%\platform-tools` (added to `PATH` by the simulator-setup section above).
Enable **Developer Options → USB Debugging** on the phone before plugging it in and accept the
fingerprint prompt. `-r` only works for upgrades signed with the **same** keystore as the previous
install — if signatures differ, `adb uninstall com.vshpynta.expensestracker` first.

**Wireless (no cable needed)**

- **Cloud storage (OneDrive / Google Drive / Dropbox).** Drop `app-release.apk` into any folder
  synced to your cloud drive, open that drive's app on the phone, tap the APK to download it, then
  tap the downloaded file to launch Android's package installer. The first time you do this Android
  asks **"Allow OneDrive (or Drive / Dropbox / your browser) to install unknown apps"** — enable it
  for that app and proceed. Android then shows a Play-Protect warning ("an unknown developer…"); tap
  **More details → Install anyway**. This is the easiest path when you don't have `adb` set up.
- **EAS build URL** (Options A & B only). Open the build URL from `npx eas build` on the phone, tap
  the `.apk` link, follow the same "Install unknown apps" → "Install anyway" prompts.
- **Self-hosted HTTP server.** From the APK's directory on your PC, run
  `python -m http.server 8000`, then open `http://<your-PC-LAN-ip>:8000/app-release.apk` on the phone
  over the same Wi-Fi. Same install prompts apply.

### Practical notes

- **First launch is slow** — 10–20 s while Android AOT-compiles the JS bundle. Normal for a release
  build; subsequent launches are sub-second.
- **Version bumps.** The `preview` profile inherits `version` and `android.versionCode` from
  [`app.json`](./app.json). Bump `versionCode` before each new APK so Android treats it as an upgrade
  rather than refusing to install (or add `"autoIncrement": true` to the `preview` profile in
  `eas.json` to let EAS bump it for you).
- **iOS sideloading** is a different story: it requires an Apple Developer account ($99/year),
  device-specific provisioning, and either macOS with Xcode or `eas build --platform ios` followed
  by TestFlight distribution. Out of scope for "tap and install".

---

## 🔐 Cloud-Drive Sync — Getting OAuth Client IDs

The mobile app uses **OAuth 2.0 with PKCE** to talk to Google Drive and OneDrive. There is **no client
secret** — PKCE replaces it with a per-flow code challenge — so the only thing you need to provide is the
**Client ID** for each provider. Both client IDs are referenced as constants in source:

| Provider     | Constant                    | File                                                        |
|--------------|-----------------------------|-------------------------------------------------------------|
| Google Drive | `GOOGLE_OAUTH_CLIENT_ID`    | [`src/sync/googleDriveAdapter.ts`](./src/sync/googleDriveAdapter.ts) |
| OneDrive     | `MICROSOFT_OAUTH_CLIENT_ID` | [`src/sync/oneDriveAdapter.ts`](./src/sync/oneDriveAdapter.ts)       |

Both files ship with a `TODO_REPLACE_WITH_*` placeholder. Replace those values with the IDs you obtain
from the steps below before running the OAuth flow on a device.

The redirect URI used by both adapters is **`expensestracker://redirect`** — derived from the `scheme`
field in [`app.json`](./app.json). The bundle / package identifier is **`com.vshpynta.expensestracker`**
for both iOS and Android.

> ⚠️ **You cannot test the OAuth flow in Expo Go.** Expo Go ignores the app's custom `scheme` and
> generates a sandbox redirect URI like `exp://192.168.x.x:8081/--/redirect`, which neither Microsoft
> nor Google will accept. You must run the app in a **development build** (or production build) so
> that the native binary owns the `expensestracker` scheme:
>
> ```powershell
> cd expenses-tracker-mobile
> # one-time — already added to package.json:
> # npx expo install expo-dev-client
>
> # Android (requires Android SDK / emulator / USB-connected device):
> npx expo run:android
>
> # iOS (requires macOS + Xcode):
> npx expo run:ios
>
> # Or build a dev client in the cloud and install the resulting .apk / .ipa:
> npx eas build --profile development --platform android
> ```
>
> Inside a dev build, `AuthSession.makeRedirectUri({ scheme: 'expensestracker', path: 'redirect' })`
> correctly returns `expensestracker://redirect`. The sign-in dialog in **Settings → Cloud sync** logs
> the live value as `[oauth] redirectUri = …` to Metro so you can verify before talking to the
> provider's redirect-URI registration.

### Microsoft (OneDrive)

1. Sign in to <https://entra.microsoft.com> and open **App registrations → New registration**.
2. Choose **Personal Microsoft accounts only** (this matches the `consumers` tenant used by the adapter).
   If you also need work / school accounts, pick **Accounts in any organizational directory and personal
   Microsoft accounts** and change the tenant in `oneDriveAdapter.ts` from `consumers` to `common`.
3. Under **Redirect URI**, select **Mobile and desktop applications** and add
   `expensestracker://redirect` exactly.
4. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add:
    - `Files.ReadWrite.AppFolder`
    - `offline_access` (so the app can refresh tokens silently)
5. Open **Authentication (Preview) → Settings** tab and toggle **Allow public client flows** to
   **Enabled**, then click **Save** (PKCE is a public-client flow). In the classic Authentication
   experience the same toggle lives at the bottom of the page under **Advanced settings → Allow public
   client flows: Yes**.
6. Copy the **Application (client) ID** from the **Overview** blade and paste it into
   `MICROSOFT_OAUTH_CLIENT_ID`.

### Google (Google Drive)

1. Sign in to <https://console.cloud.google.com>, create a project (or pick an existing one), and open
   **APIs & Services → Library → Google Drive API → Enable**.
2. Open **APIs & Services → OAuth consent screen** and configure the app for **External** users (Testing
   mode is fine for development).
3. Open **APIs & Services → Credentials → Create Credentials → OAuth client ID** and create **two**
   clients — one per platform — using the bundle / package identifier `com.vshpynta.expensestracker`:
    - **iOS** — Bundle ID `com.vshpynta.expensestracker`.
    - **Android** — Package name `com.vshpynta.expensestracker` plus the SHA-1 fingerprint of the keystore
      EAS uses to sign the app (run `npx eas credentials` to retrieve it).
4. Under **Scopes**, the app only requests `https://www.googleapis.com/auth/drive.appdata` — no broad
   Drive scope, so your app stays inside Google's lightweight verification path.
5. Copy the resulting **Client ID** and paste it into `GOOGLE_OAUTH_CLIENT_ID`.

### Will other users be able to use my app registration?

**Yes — that's the whole point.** An app registration in Entra ID (or in Google Cloud) is just a
**public identity** for your app. It is *not* tied to your personal OneDrive / Drive — it's a record
that says "an app named `vs-expenses-tracker` exists, here's its client ID, here's where it's allowed
to redirect after login, and here are the permissions it can ask for."

When another user installs your mobile app:

1. The app opens the system browser to Microsoft's (or Google's) login page, passing **your client
   ID** + the redirect URI `expensestracker://redirect` + the requested scopes.
2. The user signs in with **their own** Microsoft / Google account.
3. The provider shows a consent screen: *"vs-expenses-tracker wants to access files it creates in your
   OneDrive."*
4. After they consent, the provider redirects back to the app with an auth code.
5. The app exchanges the code (plus the PKCE verifier) for an access token + refresh token. The tokens
   belong to **that user**, scoped to **their** drive's app folder (`approot` / `appDataFolder`).
   Users cannot see each other's data, and you as the app owner have no access to anyone else's data
   either.

The **only thing shared** between users is the client ID — that's why it is safe to commit.

#### Who can sign in — the "Supported account types" setting

For Microsoft / Entra registrations specifically, **who** is allowed to sign in depends on the
**Supported account types** option you picked at registration time:

| Setting in Entra                                                  | Who can log in                                                                   | Tenant in `oneDriveAdapter.ts` |
|-------------------------------------------------------------------|----------------------------------------------------------------------------------|--------------------------------|
| **Personal Microsoft accounts only**                              | Only `@outlook.com`, `@hotmail.com`, `@live.com`, Xbox, etc. (NOT work / school) | `consumers`                    |
| **Accounts in any org directory and personal Microsoft accounts** | Anyone — personal + any company / school Microsoft 365 tenant                    | `common`                       |
| **Accounts in any organizational directory only**                 | Any work / school tenant, no personal accounts                                   | `organizations`                |
| **Accounts in this organizational directory only**                | Only users in *your* tenant — single-tenant app                                  | `<your-tenant-id>`             |

The default in the registration steps above is **Personal Microsoft accounts only** (matches
`consumers`). If you want users with only a work / school Microsoft account to sign in too, pick
**"Any org directory + personal"** and change the tenant constant in
[`src/sync/oneDriveAdapter.ts`](./src/sync/oneDriveAdapter.ts) from `consumers` to `common`.

#### "Unverified publisher" warning

Until you complete [Publisher
Verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview),
users other than you will see a yellow *"unverified app"* warning on the Microsoft consent screen.
It is not blocking — for personal use or small-scale testing it is harmless — but for a wider release
you would want to verify your publisher domain.

### How the `expensestracker://redirect` URI actually works

This is the part of OAuth that feels like magic until you see what is happening under the hood. The
short version: **Microsoft does not redirect to anything on the internet. It tells the device's OS to
open a URL with a custom scheme, and the OS routes that URL to your app.**

```
┌──────────────┐                                  ┌──────────────────┐
│  Mobile App  │ ── 1. open browser ────────────► │   System         │
│  (Expo)      │                                  │   Browser        │
└──────────────┘                                  └──────────────────┘
       ▲                                                   │
       │                                                   │ 2. user signs in
       │                                                   │    + consents
       │                                                   ▼
       │                                          ┌──────────────────┐
       │                                          │ login.microsoft  │
       │                                          │ online.com       │
       │                                          └──────────────────┘
       │                                                   │
       │                                                   │ 3. HTTP 302 Redirect:
       │                                                   │    Location: expensestracker://redirect?code=...
       │                                                   ▼
       │                                          ┌──────────────────┐
       │                                          │  Browser tries   │
       │                                          │  to open URL     │
       │                                          └──────────────────┘
       │                                                   │
       │                                                   │ 4. OS sees scheme
       │                                                   │    "expensestracker://"
       │                                                   │    and looks up
       │                                                   │    which app owns it
       │                                                   ▼
       │                                          ┌──────────────────┐
       └─── 5. OS hands URL to app ◄───────────── │   Android / iOS  │
                                                  │   scheme handler │
                                                  └──────────────────┘
```

Two pieces make this work:

#### 1. The app *claims* the scheme at install time

In [`app.json`](./app.json):

```json
{
  "expo": {
    "scheme": "expensestracker"
  }
}
```

When Expo / EAS builds the native binaries, this scheme is compiled into the platform manifests:

- **Android** — into `AndroidManifest.xml` as an `<intent-filter>`:
  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="expensestracker"/>
  </intent-filter>
  ```
- **iOS** — into `Info.plist` as a `CFBundleURLTypes` entry:
  ```xml
  <key>CFBundleURLSchemes</key>
  <array><string>expensestracker</string></array>
  ```

When the app is installed, the OS registers this claim in a system-wide *scheme → app* table.

#### 2. Microsoft *records* the redirect URI as a plain string

When you registered the app in Entra, you added `expensestracker://redirect` to the redirect URIs
list. Microsoft's auth server stores this string verbatim. During step 3 of the flow it just emits
an HTTP 302:

```
HTTP/1.1 302 Found
Location: expensestracker://redirect?code=ABC123&state=xyz
```

Microsoft has no idea what `expensestracker://` is. It does not "look up where your app lives" — it
just trusts that whoever registered the app knows what they are doing and emits the URL as-is.

#### The handoff

The browser receives the 302 and tries to navigate to `expensestracker://redirect?code=...`. Since
the scheme is not `http` / `https`, the browser asks the OS:

- **Android** fires `Intent.ACTION_VIEW`; the OS consults its scheme table and launches the app
  registered for `expensestracker`, passing the full URL as intent data.
- **iOS** invokes `application:openURL:options:` on the app registered for that scheme.

In React Native / Expo this surfaces as a `Linking` event. The
[`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/) library (configured
via [`src/sync/oauthClient.ts`](./src/sync/oauthClient.ts)) subscribes to that event, parses the URL,
extracts `code` + `state`, and resolves the awaiting promise. The app then exchanges the code (plus
its PKCE verifier) for tokens and finishes the flow.

#### Why this is secure

You might wonder: *"What if a malicious app also claims `expensestracker://`?"* That is exactly why
**PKCE** is required for public clients.

- At the **start** of the flow, the app generates a random `code_verifier` and sends only its
  SHA-256 hash (`code_challenge`) to Microsoft.
- The `code_verifier` **never leaves the originating app's memory**.
- At the **end** of the flow, the app must present the original `code_verifier` to exchange the
  auth code for tokens.

A hostile app that intercepts the redirect URL gets the auth code but cannot compute the verifier
(SHA-256 is one-way), so the code is useless to it.

For even stronger guarantees you can switch to **Android App Links** / **iOS Universal Links** —
real `https://yourdomain.com/redirect` URLs that the OS verifies against `assetlinks.json` /
`apple-app-site-association` files hosted on your domain. That eliminates scheme hijacking entirely
but requires you to own a domain. Custom-scheme + PKCE is the standard pattern that both Microsoft
and Google explicitly recommend for native apps without their own backend.

#### Common failure modes (and what they confirm about the model)

| Symptom                                              | Likely cause                                                                           |
|------------------------------------------------------|----------------------------------------------------------------------------------------|
| Browser shows *"Can't open page — unknown protocol"* | App not installed, or `scheme` in `app.json` doesn't match what's registered           |
| Microsoft shows error `AADSTS50011`                  | The redirect URI string doesn't match the registration **exactly** (e.g. trailing `/`) |
| App opens but the auth promise never resolves        | `expo-auth-session` listener not wired up, or the app was killed during the flow       |
| Two apps both claim `expensestracker://`             | OS shows an app picker (Android) or uses install order (iOS) — pick a unique scheme    |

### Are these Client IDs sensitive?

**No — Client IDs are public identifiers under the PKCE flow** and are safe to commit to a public Git
repository. They identify your app to the OAuth provider but cannot be used to obtain tokens on their
own (the per-flow code-verifier secret stays on the device). For comparison, the web frontend's Keycloak
public client ID (`expenses-frontend`) is committed to this repo for the same reason.

**Never commit any of these:**

- OAuth **client secrets** (PKCE removes the need for one — your registration must NOT have one)
- **Refresh tokens** or **access tokens** (the app stores them in `expo-secure-store`, i.e. iOS Keychain
  / Android Keystore — _never_ in `AsyncStorage` or in source)
- **Service-account JSON keys** (not used by this app at all)

If you accidentally leak a token, revoke it from the provider's console and rotate. If you leak a Client
ID, you do not need to rotate it — but you should still review the registration's permitted redirect
URIs.

---

## 📦 Mobile Note (`expo-sqlite`)

The mobile module uses **expo-sqlite** with `withTransactionAsync` blocks instead of Room. Batching the
projector's UPSERTs in a single transaction is already enough on mobile, because:

- the SQLite database is local (no network round trip per statement),
- a typical sync batch is small (≤ 100 events for a personal expense tracker),
- the `RemoteEventApplier` already runs the whole batch inside one `db.withTransactionAsync` call.

If profiling ever shows the per-statement loop is a bottleneck on a constrained device, the same
multi-row VALUES technique described in
[`expenses-tracker-api/README.md → Performance Optimization`](../expenses-tracker-api/README.md#-performance-optimization-batch-processing-recommended)
translates directly to expo-sqlite — but it has not been needed in practice.

---

## 📄 Key Files

- **[`.github/instructions/expenses-tracker-mobile.instructions.md`](../.github/instructions/expenses-tracker-mobile.instructions.md)**
  — full coding conventions for this module (RN Paper v5, Expo Router, TanStack Query over local
  store, i18n, time injection, security).
- **[`src/sync/syncEngine.ts`](./src/sync/syncEngine.ts)** — the orchestration loop with
  retry-on-`ConcurrencyError`.
- **[`src/sync/oauthClient.ts`](./src/sync/oauthClient.ts)** — shared PKCE helper used by both Drive
  adapters; persists tokens via `expo-secure-store` and serializes refresh requests behind a single
  in-flight promise.
- **[`src/sync/autoSyncCoordinator.ts`](./src/sync/autoSyncCoordinator.ts)** — single source of truth
  for **all** automatic sync triggers (cold start, foreground, after-write debounce, app-background
  flush, network reconnect, manual button). Enforces in-flight de-duplication and 30 s throttle.
- **[`src/sync/autoSyncSignal.ts`](./src/sync/autoSyncSignal.ts)** — module-level `notifyLocalWrite()`
  used by mutation hooks to bump the after-write debounce.
- **[`src/components/SyncCloudDialog.tsx`](./src/components/SyncCloudDialog.tsx)** — the
  Settings → Cloud sync dialog (provider picker, "Sync now" button, auto-sync toggle, status footer
  with last-sync timestamp).

---

## 📚 Related Documentation

- [**Root README**](../README.md) — Project pitch, **Sync Engine Architecture** including
  **Mobile Sync (TypeScript Port)** with the *Automatic Sync Triggers, Throttling, and Bandwidth*
  subsection, **Why This Architecture**, **Technical Decisions**, CI/CD, References.
- [**Backend README**](../expenses-tracker-api/README.md) — REST API, event-sourced backend that
  shares the same sync file format. The mobile app does **not** depend on this — both are independent
  implementations of the same protocol.
- [**Frontend README**](../expenses-tracker-frontend/README.md) — Web client (online-only).
- [**`.github/instructions/expenses-tracker-mobile.instructions.md`**](../.github/instructions/expenses-tracker-mobile.instructions.md)
  — Path-scoped Copilot rules for this module.
- [**`AGENTS.md`**](../AGENTS.md) — Agent-targeted quick-reference for all modules.

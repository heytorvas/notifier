# Provider setup and Android build tutorial

This guide configures a private Notifier installation for two Android devices:

- a transmitter that reads notifications from selected apps;
- a receiver that posts the mirrored notifications and forwards them to a connected watch.

Notifier uses Firebase Cloud Messaging (FCM) for delivery and a Cloudflare Worker with D1 for
pairing, authorization, retry responses, and ciphertext forwarding. Notification content is
encrypted on the transmitter. Cloudflare and Firebase do not receive the plaintext or encryption
key.

## 1. Accounts and local prerequisites

Create free accounts for:

- [Firebase](https://console.firebase.google.com/)
- [Cloudflare](https://dash.cloudflare.com/)
- [Expo](https://expo.dev/) if using the recommended EAS cloud build

Install:

- Node.js 22.13 or newer
- npm
- Git
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`)

For a local native build, also install:

- JDK 17
- Android SDK Platform 37 and Android SDK Build-Tools 37
- Android platform-tools if installing with `adb`

Clone the repository and install dependencies:

```bash
git clone <your-repository-url>
cd notifier
npm install
npm run relay:install
```

If npm reports a peer-resolution conflict, retry the root installation with:

```bash
npm install --legacy-peer-deps
```

Do not use Expo Go. Notifier contains an Android notification-listener service and an FCM service
that are unavailable in Expo Go.

## 2. Sign in once

The setup command uses your existing CLI logins. It does not store tokens in the repository.

```bash
npx -y firebase-tools@latest login
gcloud auth login
cd relay && npx wrangler login
npx eas-cli@latest login
```

Stay on the Firebase Spark plan and the Cloudflare Workers Free plan. The command enables only the Firebase Cloud Messaging API. It does not enable Firestore, Cloud Functions, or the Blaze plan.

## 3. Provision Firebase, Cloudflare, and the app environment

From the repository root, pick a Firebase project id that is 6–30 characters and uses lowercase letters, digits, and hyphens. If that project does not exist, the command creates it.

```bash
npm run setup:providers -- --project-id your-firebase-project-id
```

The command is safe to run again. It reuses an existing project, the Android app `dev.heytor.notifier`, the `notifier-relay` service account, the D1 database, and Worker secrets when they are already present.

On a first run it:

1. Creates the Firebase project and Android app, then reads the public app id, API key, project id, and sender id.
2. Enables `fcm.googleapis.com`.
3. Creates the `notifier-relay` service account and grants only `roles/firebasecloudmessaging.admin`.
4. Creates a JSON key in a temporary directory outside the repository, uploads `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` as Worker secrets, and deletes the key file.
5. Creates D1 database `notifier-relay` when `relay/.env` has no database id and `relay/wrangler.toml` still has the placeholder, writes `CLOUDFLARE_D1_DATABASE_ID` and `FIREBASE_PROJECT_ID` to the gitignored `relay/.env`, and applies the remote migrations.
6. Deploys the Worker and requires `{"status":"ok"}` from `https://…/health`.
7. Writes the five public `EXPO_PUBLIC_*` values to `.env`.
8. Copies those same values into the EAS `preview` environment.

`.env` and `relay/.env` are gitignored. The committed `app.json` and `wrangler.toml` keep placeholders. `app.config.ts` and `npm --prefix relay run deploy` apply the env values at build and deploy time. The service-account private key is never written into either env file, `app.json`, or Worker `[vars]`.

Useful flags:

```bash
npm run setup:providers -- --dry-run --project-id your-firebase-project-id
npm run setup:providers -- --skip-eas --project-id your-firebase-project-id
```

`--dry-run` prints the plan and does not create resources. `--skip-eas` is for a local APK build that only needs `.env`.

## 4. Configure the Android app locally

This section is performed by `npm run setup:providers`. The values it writes are:

```dotenv
EXPO_PUBLIC_RELAY_URL=https://notifier-relay.<your-subdomain>.workers.dev
EXPO_PUBLIC_FIREBASE_APPLICATION_ID=1:123456789:android:abcdef
EXPO_PUBLIC_FIREBASE_API_KEY=your-firebase-web-api-key
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
EXPO_PUBLIC_FIREBASE_SENDER_ID=123456789
```

Value mapping:

- `APPLICATION_ID`: the Firebase Android app ID, called `mobilesdk_app_id` in Firebase config;
- `API_KEY`: the Firebase Web API key, called `current_key` in Firebase config;
- `PROJECT_ID`: the Firebase project ID;
- `SENDER_ID`: the numeric Firebase project number;
- `RELAY_URL`: the deployed HTTPS Cloudflare Worker URL without an endpoint suffix.

All `EXPO_PUBLIC_*` values are compiled into the APK and must be treated as public. Never put the
Firebase service-account email or private key in an `EXPO_PUBLIC_*` variable.

Validate the complete project:

```bash
npm run typecheck
npm run lint
npm test
npm run relay:typecheck
npm run relay:test
npx expo-doctor
npx expo export --platform android --output-dir dist-check
```

## 5. Configure EAS environment variables

`npm run setup:providers` writes these five plain-text variables into the EAS `preview` environment.
A remote EAS build cannot read the gitignored `.env` file. The checked-in `eas.json` selects the
`preview` environment, internal distribution, and APK output. These variables are plain text because
any `EXPO_PUBLIC_*` value is readable from the built app regardless of its EAS visibility setting.

## 6. Build the installable APK with EAS

The recommended build requires no local Android Studio installation:

```bash
npx eas-cli@latest build --platform android --profile preview
```

On the first build, EAS may ask to generate Android signing credentials. Allow EAS to generate and
manage a new keystore unless you already have the keystore that must sign upgrades of this package.

When the build finishes:

1. Open the build URL.
2. Download the `.apk`.
3. Verify that the build page reports the `preview` profile and the expected app version.
4. Keep the APK private. Anyone with the APK can install it, although they cannot access an
   existing pairing without its capabilities and encryption key.

EAS credentials are important for upgrades: Android accepts an update only when it is signed by the
same key as the installed version. Do not delete or replace the keystore after distributing the
first APK.

## 7. Optional local APK build

Use this only when JDK 17 and Android SDK Platform 37 are installed:

```bash
npx expo prebuild --clean --platform android --no-install
cd android
./gradlew testDebugUnitTest lintDebug assembleRelease
```

On Windows, run `gradlew.bat` instead of `./gradlew`.

The APK is normally written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The generated `android/` directory is intentionally ignored because this project uses Expo
Continuous Native Generation. Never make permanent changes directly inside generated `android/`;
change `app.json` or the local Expo module instead, then regenerate it.

## 8. Install on both devices

You can open the EAS download URL on each Android device, or install over USB:

```bash
adb install -r path/to/app-release.apk
```

Android may require enabling **Install unknown apps** for the browser or file manager used to open
the APK. Disable that permission again after installation if it is not otherwise needed.

Install the same APK on the device that will transmit and the device that will receive. A paired
watch does not install Notifier; it shows the notifications posted on the receiving device.

## 9. First-run pairing

On the receiving device:

1. Open Notifier.
2. Choose **Receive**.
3. Grant Android notification permission.
4. Leave the one-time QR code visible, or copy the code.

On the transmitting device:

1. Open Notifier.
2. Choose **Send**.
3. Scan the QR code, or paste the code.
4. Enable Notifier in Android's **Notification access** settings.
5. Select the apps whose new alerting notifications should be mirrored.

## 9a. Later JavaScript updates

Native changes, including this notification and design release, require a new APK. After both
devices run the same native version, publish JavaScript with:

```bash
npx eas-cli@latest update --channel preview --environment preview
```

Each device shows **Update available**. Tapping it reloads the app and keeps the existing pairing.
6. Save the selection.

The QR claim is single-use. A second transmitter must not be able to claim it. To replace a device,
reset pairing and generate a new code.

On both Samsung devices, add Notifier to:

```text
Settings → Battery → Background usage limits → Never sleeping apps
```

Also keep every selected source app out of **Deep sleeping apps**. Notifier cannot mirror a
notification that Samsung has delayed before delivering it to the tablet.

In Galaxy Wearable on the phone, enable notifications for Notifier and review lock-screen privacy
settings.

## 10. Verify real delivery

Before depending on banking alerts:

1. Select a harmless test app on the tablet.
2. Generate a notification with the tablet screen locked.
3. Confirm one notification appears on the phone.
4. Confirm it contains the source app name, title, and text.
5. Confirm one corresponding alert appears on the Galaxy Watch.
6. Put the tablet offline, generate another alert, restore the network, and confirm retry delivery.
7. Reboot both Android devices and repeat.
8. Complete the full acceptance runbook in
   [`DEVICE_TEST_MATRIX.md`](DEVICE_TEST_MATRIX.md).

Android 15 and newer may redact detected one-time codes before a notification listener can read
them. Notifier cannot bypass this operating-system protection.

## 11. Troubleshooting

### The app reports missing configuration

One or more `EXPO_PUBLIC_*` values were unavailable during the build. Local builds use `.env`;
remote EAS builds use the `preview` EAS environment. Rerun `npm run setup:providers` after
correcting the project, then rebuild.

### Pairing fails immediately

- Confirm the Worker health endpoint is reachable over HTTPS.
- Confirm the D1 migration was applied remotely.
- Confirm the QR came from the receiver and has not already been claimed.
- Confirm both APKs use the same relay and Firebase project.
- Reset the receiver to invalidate an unusable or partially claimed code.

### Pairing works but messages do not arrive

- Confirm the sending device says Connected. Reconnecting means notification access is still granted, but Android has dropped the listener. The app restarts that binding on its own; the activity log says when it requests a rebind or resets the binding. If Reconnecting remains, turn Notifier off and on in notification access, then open Notifier again.
- Not delivering on the receiving device means the sending device reported that its listener is down, or it has not checked in for 3 hours. Connected on the receiver only means that phone can post alerts.
- Pairing check failed with SocketTimeoutException, SocketException, or UnknownHostException means that device could not reach the relay. Those checks retry and do not stop mirroring. The activity log says Pairing check restored after the next success.
- Open Activity on the dashboard. It records listener, relay, and delivery failures without notification text.
- Confirm the source app is selected.
- Confirm the phone granted notification permission and did not disable the mirrored-notifications
  channel.
- Confirm the FCM HTTP v1 API is enabled.
- Confirm the Cloudflare service account email and private key are valid.
- Confirm the service account has `roles/firebasecloudmessaging.admin`.
- Inspect Worker logs with `cd relay && npx wrangler tail`; logs must not contain plaintext
  notification content.

### Notifications arrive only after unlocking the tablet

This occurs before Notifier receives the source notification. Remove Notifier and the source app
from Samsung sleeping/deep-sleeping lists, add them to Never sleeping apps, and test with Power
saving disabled.

### The Watch does not show the alert

Verify that the phone receives it first. Then enable Notifier under Galaxy Wearable notification
settings and check whether the watch is configured to show phone notifications while the phone is
in use.

### An APK update is rejected

The new APK was signed with a different Android keystore. Build with the original EAS project and
credentials, or uninstall the old app and accept that uninstalling removes local pairing state.

## MCP availability

Provisioning is done by `npm run setup:providers`, which calls the Firebase CLI, `gcloud`, and the
project's Wrangler. MCP lets Cursor inspect the same accounts after you sign in.

- Firebase is configured in `.cursor/mcp.json` and limited to core project tools and Cloud Messaging.
  Restart Cursor after pulling that file, then run `npx -y firebase-tools@latest login` if the server
  asks for authentication.
- Cloudflare is the installed Cursor plugin at `https://mcp.cloudflare.com/mcp`. Its OAuth login is
  separate from `wrangler login`.

The private key still goes only through Wrangler secrets. Do not paste it into chat.

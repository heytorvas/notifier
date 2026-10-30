# Notifier

Notifier privately mirrors selected Android notifications from one Android device to another.

Notification content is encrypted with AES-256-GCM on the transmitting device. The Cloudflare
Worker and Firebase Cloud Messaging receive ciphertext only, and the relay does not store message
content. Pairing credentials and encryption keys are wrapped by Android Keystore on each device.
The QR contains a one-time claim capability; after one successful scan it cannot pair another
device. Pending sends contain ciphertext only and are durably retried by Android WorkManager for
up to seven days.

## Requirements

- Node.js 22.13 or newer
- JDK 17
- Android SDK and an Android device
- A free Firebase project with Cloud Messaging enabled
- A free Cloudflare account with Workers and D1

Expo Go cannot run this app because notification capture and delivery use native Android services.
Use an Android development or release build.

For the complete Firebase, Cloudflare, EAS, APK, installation, and troubleshooting walkthrough,
follow [`docs/SETUP_AND_BUILD.md`](docs/SETUP_AND_BUILD.md).

## Configure Firebase and deploy the relay

Sign in to Firebase, Google Cloud, Cloudflare, and Expo once, then provision the free-tier
project, D1 database, Worker secrets, `.env`, and EAS preview variables:

```bash
npx -y firebase-tools@latest login
gcloud auth login
cd relay && npx wrangler login && cd ..
npx eas-cli@latest login
npm run setup:providers -- --project-id your-firebase-project-id
```

The command stays on the Firebase Spark plan and Workers Free plan. It stores the service-account
private key only as a Cloudflare secret, then deletes the local key file. Never place that key in
`.env` or in the Android app.

The full walkthrough is in [`docs/SETUP_AND_BUILD.md`](docs/SETUP_AND_BUILD.md).

## Build Android

```bash
npm install
npx expo prebuild --clean --platform android
npx expo run:android --variant release
```

Install the same APK on both devices. On the device that should display alerts, choose **Receive**.
On the device that already gets the alerts, choose **Send**, scan the QR code, enable Notifier
under Android notification access, and select the source apps.

After this native release, JavaScript fixes can ship without another APK. Publish to the `preview`
channel:

```bash
npx eas-cli@latest update --channel preview --environment preview
```

The installed app shows **Update available**. Tapping it downloads the update and reloads.
Pairing and selected apps stay on the device. Native changes still need a new APK, with a higher
`versionCode`, signed by the same keystore.

## Background limits

Some Android skins delay apps that are not exempted from battery restrictions. If alerts arrive
only after the transmitting device is unlocked, exempt Notifier and each selected source app from
sleeping or battery optimization on that device. Do the same for Notifier on the receiving device
when delivery stops while the screen is off.

## Platform limitations

- Android 15 and newer may redact notifications it classifies as sensitive, including some
  one-time codes. The permission that would reveal them is not grantable to a normal app.
- FCM may discard pending data after a large offline backlog (commonly more than 100 messages).
  Notifier displays a warning when Firebase reports deleted messages.
- A watch or other paired wearable shows whatever the receiving Android device posts. That
  forwarding is controlled by the wearable's companion app, not by Notifier.
- Screenshot capture is blocked while the receiver pairing secret is displayed, but the manual
  code must still be handled as a secret.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run relay:typecheck
npm run relay:test
```

Native compilation and real delivery require the additional release checks in
[`docs/DEVICE_TEST_MATRIX.md`](docs/DEVICE_TEST_MATRIX.md).

The receiver intentionally has no notification history. Android owns displayed notifications, and
the app does not retain their plaintext.

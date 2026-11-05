# Android device acceptance matrix

Automated tests cannot prove notification-listener, Firebase delivery, Samsung background
management, or Galaxy Watch behavior. Run this matrix against the release APK before relying
on Notifier for banking alerts.

## Target devices

- Transmitter: Samsung Galaxy Tab S6 Lite, Android 14
- Receiver: Samsung Galaxy S25 FE, Android 17
- Wearable: Samsung Galaxy Watch 7 paired with the receiver
- Use a test notification source that does not expose real financial or personal data.

Record the APK hash, app version, OS/build number, One UI version, Watch OS version, network,
battery mode, result, and evidence for each run.

## Installation and lifecycle

- [ ] Fresh-install the same release APK on both Android devices.
- [ ] Confirm Android does not offer Notifier on iOS/web and the APK contains no unsupported ABI.
- [ ] Upgrade from the previous APK without clearing data; pairing and app selection survive.
- [ ] Clear data independently on each device; no old pairing appears healthy.
- [ ] Uninstall and reinstall independently; Android backup does not restore keys or pairing.
- [ ] Force-stop each app and reopen it; state is accurate and no crash occurs.
- [ ] Reboot each device; pairing survives and the listener resumes.
- [ ] Kill the UI process while leaving the tablet locked; later notifications still deliver.

## Pairing and recovery

- [ ] Choose receiver on the phone and transmitter on the tablet.
- [ ] Pair by QR and confirm the receiver advances automatically.
- [ ] Pair with the manual code when camera access is denied.
- [ ] Deny camera permission, deny it permanently, and recover through Android Settings.
- [ ] Cancel receiver pairing; the remote inbox is deleted when online.
- [ ] Cancel while offline, restart the phone, reconnect, and confirm deferred deletion runs.
- [ ] Close the receiver before scanning; reopen and confirm the same unfinished QR is restored.
- [ ] Close the receiver after scanning; reopen and confirm it remains paired.
- [ ] Scan malformed, truncated, oversized, wrong-version, and non-Notifier QR values.
- [ ] Scan a valid QR with one character changed in the inbox ID, token, and key.
- [ ] Scan an expired/deleted receiver code and show a recoverable error.
- [ ] Scan the same one-time QR from a second tablet; it must be rejected.
- [ ] Interrupt the tablet network during claim; the UI explains that receiver reset may be needed.
- [ ] Reset either device and pair again; old keys cannot send or decrypt.
- [ ] Confirm Android blocks screenshots and screen recording on the receiver QR screen.

## Permissions and health reporting

- [ ] Deny notification-listener access on the tablet; saving app selection stays blocked.
- [ ] Grant access and return; health changes without restarting.
- [ ] Revoke access while paired; the dashboard shows unhealthy state and opens the right setting.
- [ ] Disable Notifier notifications globally on the phone; dashboard shows unhealthy state.
- [ ] Disable only the mirrored-notifications channel; dashboard shows unhealthy state.
- [ ] Restore global/channel permission and confirm health recovers.
- [ ] Deny Android 13+ notification permission once and permanently; recovery opens app settings.
- [ ] Disconnect/rebind the notification-listener service and verify health reflects real connection.
- [ ] Confirm the Android 15+ OTP-redaction warning appears only on relevant transmitter versions.

## App selection and source filtering

- [ ] Search installed launchable apps by display name and package name.
- [ ] Select multiple apps, save, reopen, and confirm package-based selection persists.
- [ ] Select and deselect the same app repeatedly; the count and saved result remain correct.
- [ ] Search with mixed case, whitespace, Unicode, and no matches.
- [ ] Confirm Notifier itself and non-launchable system packages are absent.
- [ ] Confirm missing or unreadable app icons show a stable placeholder.
- [ ] Exercise a device with many installed apps; scrolling remains smooth and memory stays bounded.
- [ ] Notifications from selected apps mirror; unselected apps never mirror.
- [ ] Ongoing notifications and group summaries do not mirror.
- [ ] Alerting child notifications mirror exactly once.

## Notification content

- [ ] Test title and body, title only, body only, expanded BigText, and empty content.
- [ ] Test emoji, accents, right-to-left text, multiline text, and mixed scripts.
- [ ] Test maximum and over-limit app name, title, and body; content truncates without crashing.
- [ ] Verify source app name, title, and text are readable without app-specific rewriting.
- [ ] Verify the relay database stores no plaintext or ciphertext notification content.
- [ ] Verify each device shows the newest 400 sent or received alerts, including failures, until unpair clears them.
- [ ] Unpair from either device and confirm the other device drops the pairing without a second reset.
- [ ] On Android 15+, test a detected OTP and confirm the OS limitation matches the disclosure.
- [ ] Send a tampered nonce, ciphertext, key, and protocol version; receiver drops it safely.
- [ ] Replay the same message ID; only one user-visible alert is produced.
- [ ] Deliver a message older than seven days; it is discarded.

## Connectivity, retry, and load

- [ ] Keep the tablet offline, generate alerts, restart the app/process, reconnect, and receive them.
- [ ] Keep the phone offline, generate alerts, reconnect within seven days, and receive them.
- [ ] Keep either device offline beyond seven days; expired alerts are not shown.
- [ ] Switch Wi-Fi to cellular and back during send and receive.
- [ ] Exercise DNS failure, TLS failure, connection timeout, HTTP 429, 500, and 503.
- [ ] Confirm retryable failures use backoff and permanent 4xx failures do not loop.
- [ ] Generate duplicate retries and verify relay idempotency.
- [ ] Rotate the Firebase installation ID and verify registration updates.
- [ ] Invalidate the FCM installation and verify the relay returns a terminal unavailable response.
- [ ] Burst more than 100 pending FCM messages; the receiver shows the dropped-message warning.
- [ ] Generate rapid notifications from several selected apps; no crash, ANR, or excessive battery use.
- [ ] Verify the relay stores only hashes, registration data, timestamps, and message IDs—not ciphertext
      or plaintext content.

## Samsung background behavior

- [ ] Add Notifier to Never sleeping apps on both devices and verify the instructions match each role.
- [ ] Repeat delivery with Optimized, Restricted, and Unrestricted battery settings.
- [ ] Repeat with Battery Saver, Adaptive Battery, and Samsung Power saving mode enabled.
- [ ] Leave the tablet locked and unused for 24 hours, 3 days, and 7 days, then generate test alerts.
- [ ] Put Notifier in Sleeping apps and Deep sleeping apps to confirm the dashboard guidance recovers.
- [ ] Lock the tablet immediately after a notification and confirm queued work survives.

## Galaxy Watch 7

- [ ] Enable Notifier in Galaxy Wearable notification settings.
- [ ] With phone locked, confirm source app, title, and text appear on the watch.
- [ ] With phone unlocked, verify behavior matches the Galaxy Wearable display setting.
- [ ] Test watch connected, disconnected, airplane mode, and reconnect.
- [ ] Test phone and watch lock-screen privacy settings; hidden content remains hidden as configured.
- [ ] Disable Notifier for the watch; phone still receives while watch does not.
- [ ] Confirm duplicate retries do not vibrate the watch more than once.

## Release acceptance

- [ ] App TypeScript, lint, Jest, relay typecheck/tests, Expo Doctor, and relay dry-run all pass.
- [ ] Native Kotlin unit tests, Android lint, and release assembly pass from a clean generated project.
- [ ] Inspect the merged manifest: no microphone permission, backup disabled, and only required
      notification, network, listener, Firebase, provider, and WorkManager declarations.
- [ ] Install the exact release APK on all target devices and complete every critical flow above.
- [ ] Review `adb logcat` for crashes, ANRs, leaked secrets, plaintext payloads, and retry loops.

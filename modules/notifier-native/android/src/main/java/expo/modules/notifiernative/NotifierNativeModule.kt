package expo.modules.notifiernative

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.provider.Settings
import android.util.Base64
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import androidx.core.app.NotificationManagerCompat
import expo.modules.notifiernative.data.DeviceRole
import expo.modules.notifiernative.data.NotifierStore
import expo.modules.notifiernative.data.PairingPayloadParser
import expo.modules.notifiernative.data.PairingState
import expo.modules.notifiernative.network.RelayClient
import expo.modules.notifiernative.notifications.CleanupWorker
import expo.modules.notifiernative.notifications.DeviceJournal
import expo.modules.notifiernative.notifications.IconStore
import expo.modules.notifiernative.notifications.ListenerBinding
import expo.modules.notifiernative.notifications.ListenerConnectionState
import expo.modules.notifiernative.notifications.ListenerRecovery
import expo.modules.notifiernative.notifications.MaintenanceWorker
import expo.modules.notifiernative.notifications.PairingSync
import expo.modules.notifiernative.notifications.ProfileSyncWorker
import expo.modules.notifiernative.security.CryptoStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URI

class NotifierNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NotifierNative")

    AsyncFunction("configure") { relayUrl: String, firebaseConfig: Map<String, String> ->
      require(URI(relayUrl).scheme == "https") { "The relay URL must use HTTPS." }
      val context = requireContext()
      val store = NotifierStore(context)
      val applicationId = firebaseConfig.requireValue("applicationId")
      val apiKey = firebaseConfig.requireValue("apiKey")
      val projectId = firebaseConfig.requireValue("projectId")
      val senderId = firebaseConfig.requireValue("senderId")
      store.relayUrl = relayUrl
      store.setFirebaseConfig(applicationId, apiKey, projectId, senderId)
      initializeFirebase(context, applicationId, apiKey, projectId, senderId)
      CleanupWorker.enqueue(context)
      ProfileSyncWorker.enqueue(context)
      MaintenanceWorker.enqueue(context)
    }

    AsyncFunction("getState") { stateMap() }

    AsyncFunction("syncPairing") {
      PairingSync.refresh(requireContext())
      stateMap()
    }

    AsyncFunction("getAlerts") {
      DeviceJournal(requireContext()).alerts().map { record ->
        mapOf(
          "id" to record.id,
          "at" to record.at.toDouble(),
          "direction" to record.direction,
          "appName" to record.appName,
          "packageName" to record.packageName,
          "title" to record.title,
          "text" to record.text,
          "status" to record.status,
          "detail" to record.detail,
        )
      }
    }

    AsyncFunction("getDiagnostics") {
      DeviceJournal(requireContext()).diagnostics().map { record ->
        mapOf(
          "id" to record.id,
          "at" to record.at.toDouble(),
          "message" to record.message,
        )
      }
    }

    AsyncFunction("getInstalledApps") {
      val context = requireContext()
      val packageManager = context.packageManager
      packageManager.getInstalledApplications(0)
        .asSequence()
        .filter { it.packageName != context.packageName }
        .filter { packageManager.getLaunchIntentForPackage(it.packageName) != null }
        .map {
          mapOf(
            "packageName" to it.packageName,
            "name" to packageManager.getApplicationLabel(it).toString(),
          )
        }
        .sortedBy { it["name"]?.lowercase() }
        .toList()
    }

    AsyncFunction("getAppIcon") { packageName: String ->
      val context = requireContext()
      IconStore(context).readBytes(packageName)?.let { bytes ->
        return@AsyncFunction "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
      }
      val drawable = context.packageManager.getApplicationIcon(packageName)
      val bitmap = if (drawable is BitmapDrawable) {
        Bitmap.createScaledBitmap(drawable.bitmap, ICON_SIZE, ICON_SIZE, true)
      } else {
        Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888).also {
          val canvas = Canvas(it)
          drawable.setBounds(0, 0, canvas.width, canvas.height)
          drawable.draw(canvas)
        }
      }
      ByteArrayOutputStream().use { output ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 90, output)
        "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
      }
    }

    Function("openNotificationAccessSettings") {
      requireContext().startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    AsyncFunction("setSelectedPackages") { packages: List<String> ->
      val context = requireContext()
      NotifierStore(context).selectedPackages = packages.filter(String::isNotBlank).toSet()
      ProfileSyncWorker.enqueue(context)
    }

    AsyncFunction("prepareReceiver") {
      val context = requireContext()
      val store = NotifierStore(context)
      val existing = store.pairingState?.takeIf { it.role == DeviceRole.RECEIVER }
      if (existing != null) {
        require(!existing.receiverClaimed && existing.pairingToken != null) {
          "This receiver is already paired."
        }
        return@AsyncFunction pairingCode(existing)
      }

      val relayUrl = requireNotNull(store.relayUrl) { "Relay configuration is missing." }
      require(FirebaseApp.getApps(context).isNotEmpty()) { "Firebase configuration is missing." }
      Tasks.await(FirebaseMessaging.getInstance().register())
      val registrationId = Tasks.await(FirebaseInstallations.getInstance().id)
      store.registrationId = registrationId

      val credentials = RelayClient(relayUrl).createInbox(registrationId)
      val pairing = PairingState(
        role = DeviceRole.RECEIVER,
        inboxId = credentials.inboxId,
        ownerToken = credentials.ownerToken,
        pairingToken = credentials.pairingToken,
        senderToken = null,
        pairingKey = CryptoStore.encode(CryptoStore.randomKey()),
      ).also(store::savePairing)
      ProfileSyncWorker.enqueue(context)
      pairingCode(pairing)
    }

    AsyncFunction("pairTransmitter") { encodedPairing: String ->
      val pairing = PairingPayloadParser.parse(encodedPairing)

      val store = NotifierStore(requireContext())
      val relayUrl = requireNotNull(store.relayUrl) { "Relay configuration is missing." }
      val claimed = RelayClient(relayUrl).claimInbox(pairing.inboxId, pairing.pairingToken)
      if (claimed.claimedAt != null) store.pairedAt = claimed.claimedAt
      store.savePairing(
        PairingState(
          role = DeviceRole.TRANSMITTER,
          inboxId = pairing.inboxId,
          ownerToken = null,
          pairingToken = null,
          senderToken = claimed.senderToken,
          pairingKey = pairing.pairingKey,
        ),
      )
      ProfileSyncWorker.enqueue(requireContext())
    }

    AsyncFunction("isReceiverPaired") {
      val store = NotifierStore(requireContext())
      val pairing = store.pairingState
      if (pairing?.role != DeviceRole.RECEIVER || pairing.ownerToken == null) {
        false
      } else {
        val status = RelayClient(
          requireNotNull(store.relayUrl) { "Relay configuration is missing." },
        ).pairingStatus(pairing.inboxId, pairing.ownerToken)
        if (status.claimedAt != null) store.pairedAt = status.claimedAt
        if (status.claimed && !pairing.receiverClaimed) {
          store.savePairing(pairing.copy(pairingToken = null, receiverClaimed = true))
        }
        status.claimed
      }
    }

    AsyncFunction("resetPairing") {
      PairingSync.requestUnpair(requireContext())
      CleanupWorker.enqueue(requireContext())
    }
  }

  private fun stateMap(): Map<String, Any?> {
    val context = requireContext()
    val store = NotifierStore(context)
    val pairing = store.pairingState
    val permission = if (pairing?.role == DeviceRole.RECEIVER) {
      canPostNotifications(context)
    } else {
      hasNotificationAccess(context)
    }
    if (pairing?.role == DeviceRole.TRANSMITTER) ListenerRecovery.rebindIfNeeded(context)
    val listenerConnected = ListenerBinding.listenerConnected(
      isTransmitter = pairing?.role == DeviceRole.TRANSMITTER,
      permissionGranted = permission,
      serviceConnected = ListenerConnectionState.connected,
    )
    return mapOf(
      "role" to pairing?.role?.value,
      "paired" to (
        pairing?.isComplete == true &&
          (pairing.role != DeviceRole.RECEIVER || pairing.receiverClaimed)
        ),
      "notificationAccess" to permission,
      "listenerConnected" to listenerConnected,
      "sensitiveContentLimited" to (
        pairing?.role == DeviceRole.TRANSMITTER &&
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM
        ),
      "selectedPackages" to store.selectedPackages.toList(),
      "pairedAt" to store.pairedAt,
      "peer" to peer(store),
      "transmittingApps" to transmittingApps(context, store),
    )
  }

  private fun peer(store: NotifierStore): Map<String, String>? {
    if (store.peerBrand.isBlank() && store.peerModel.isBlank()) return null
    return mapOf("brand" to store.peerBrand, "model" to store.peerModel)
  }

  private fun transmittingApps(context: Context, store: NotifierStore): List<Map<String, String>> {
    val records = if (store.pairingState?.role == DeviceRole.TRANSMITTER) {
      val packageManager = context.packageManager
      store.selectedPackages.map { packageName ->
        val name = runCatching {
          packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
        }.getOrDefault(packageName)
        packageName to name
      }
    } else {
      store.remoteApps.map { it.packageName to it.name }
    }
    return records
      .sortedBy { it.second.lowercase() }
      .map { mapOf("packageName" to it.first, "name" to it.second) }
  }

  private fun requireContext(): Context =
    requireNotNull(appContext.reactContext?.applicationContext) { "Android context is unavailable." }

  private fun pairingCode(pairing: PairingState): String =
    JSONObject()
      .put("version", 1)
      .put("inboxId", pairing.inboxId)
      .put("pairingToken", requireNotNull(pairing.pairingToken))
      .put("key", pairing.pairingKey)
      .toString()

  private fun hasNotificationAccess(context: Context): Boolean =
    NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

  private fun canPostNotifications(context: Context): Boolean =
    (
      Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
      ) &&
      NotificationManagerCompat.from(context).areNotificationsEnabled() &&
      (
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
          context.getSystemService(NotificationManager::class.java)
            .getNotificationChannel(MIRRORED_CHANNEL_ID)
            ?.importance != NotificationManager.IMPORTANCE_NONE
        )

  private fun initializeFirebase(
    context: Context,
    applicationId: String,
    apiKey: String,
    projectId: String,
    senderId: String,
  ) {
    if (FirebaseApp.getApps(context).isNotEmpty()) return
    FirebaseApp.initializeApp(
      context,
      FirebaseOptions.Builder()
        .setApplicationId(applicationId)
        .setApiKey(apiKey)
        .setProjectId(projectId)
        .setGcmSenderId(senderId)
        .build(),
    )
  }

  private fun Map<String, String>.requireValue(key: String): String =
    get(key)?.takeIf(String::isNotBlank) ?: error("Missing Firebase $key.")

  companion object {
    private const val ICON_SIZE = 96
    private const val MIRRORED_CHANNEL_ID = "mirrored_notifications"
  }
}

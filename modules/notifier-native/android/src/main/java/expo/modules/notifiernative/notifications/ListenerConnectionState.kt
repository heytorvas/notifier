package expo.modules.notifiernative.notifications

internal object ListenerConnectionState {
  @Volatile
  var connected: Boolean = false
}

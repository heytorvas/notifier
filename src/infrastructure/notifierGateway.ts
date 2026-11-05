import NotifierNative, {
  type AlertRecord,
  type DeviceRole,
  type DiagnosticRecord,
  type FirebaseConfig,
  type InstalledApp,
  type NativeState,
  type PeerDevice,
} from '../../modules/notifier-native/src/NotifierNativeModule';
import { BoundedCache } from './boundedCache';

export type { AlertRecord, DeviceRole, DiagnosticRecord, InstalledApp, NativeState, PeerDevice };

const iconCache = new BoundedCache<Promise<string>>(64);

export const notifierGateway = {
  configure(relayUrl: string, firebase: FirebaseConfig): Promise<void> {
    return NotifierNative.configure(relayUrl, firebase);
  },
  getState(): Promise<NativeState> {
    return NotifierNative.getState();
  },
  syncPairing(): Promise<NativeState> {
    return NotifierNative.syncPairing();
  },
  getAlerts(): Promise<AlertRecord[]> {
    return NotifierNative.getAlerts();
  },
  getDiagnostics(): Promise<DiagnosticRecord[]> {
    return NotifierNative.getDiagnostics();
  },
  getInstalledApps(): Promise<InstalledApp[]> {
    return NotifierNative.getInstalledApps();
  },
  getAppIcon(packageName: string): Promise<string> {
    const cached = iconCache.get(packageName);
    if (cached) return cached;
    const icon = NotifierNative.getAppIcon(packageName).catch((error: unknown) => {
      iconCache.delete(packageName);
      throw error;
    });
    iconCache.set(packageName, icon);
    return icon;
  },
  openNotificationAccessSettings(): void {
    NotifierNative.openNotificationAccessSettings();
  },
  setSelectedPackages(packages: string[]): Promise<void> {
    return NotifierNative.setSelectedPackages(packages);
  },
  prepareReceiver(): Promise<string> {
    return NotifierNative.prepareReceiver();
  },
  pairTransmitter(pairingCode: string): Promise<void> {
    return NotifierNative.pairTransmitter(pairingCode);
  },
  isReceiverPaired(): Promise<boolean> {
    return NotifierNative.isReceiverPaired();
  },
  resetPairing(): Promise<void> {
    return NotifierNative.resetPairing();
  },
};

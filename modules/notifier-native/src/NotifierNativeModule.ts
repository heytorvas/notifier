import { NativeModule, requireNativeModule } from 'expo';

export type DeviceRole = 'transmitter' | 'receiver';

export type FirebaseConfig = {
  applicationId: string;
  apiKey: string;
  projectId: string;
  senderId: string;
};

export type InstalledApp = {
  packageName: string;
  name: string;
};

export type PeerDevice = {
  brand: string;
  model: string;
};

export type NativeState = {
  role: DeviceRole | null;
  paired: boolean;
  notificationAccess: boolean;
  sensitiveContentLimited: boolean;
  selectedPackages: string[];
  pairedAt: number | null;
  peer: PeerDevice | null;
  transmittingApps: InstalledApp[];
};

declare class NotifierNativeModule extends NativeModule {
  configure(relayUrl: string, firebaseConfig: FirebaseConfig): Promise<void>;
  getState(): Promise<NativeState>;
  getInstalledApps(): Promise<InstalledApp[]>;
  getAppIcon(packageName: string): Promise<string>;
  openNotificationAccessSettings(): void;
  setSelectedPackages(packages: string[]): Promise<void>;
  prepareReceiver(): Promise<string>;
  pairTransmitter(encodedPairing: string): Promise<void>;
  isReceiverPaired(): Promise<boolean>;
  resetPairing(): Promise<void>;
}

export default requireNativeModule<NotifierNativeModule>('NotifierNative');

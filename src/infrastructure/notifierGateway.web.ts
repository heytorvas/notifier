export type DeviceRole = 'transmitter' | 'receiver';

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

type FirebaseConfig = {
  applicationId: string;
  apiKey: string;
  projectId: string;
  senderId: string;
};

const emptyState: NativeState = {
  role: null,
  paired: false,
  notificationAccess: false,
  sensitiveContentLimited: false,
  selectedPackages: [],
  pairedAt: null,
  peer: null,
  transmittingApps: [],
};

export const notifierGateway = {
  configure(_relayUrl: string, _firebase: FirebaseConfig): Promise<void> {
    return Promise.resolve();
  },
  getState(): Promise<NativeState> {
    return Promise.resolve(emptyState);
  },
  getInstalledApps(): Promise<InstalledApp[]> {
    return Promise.resolve([]);
  },
  getAppIcon(_packageName: string): Promise<string> {
    return Promise.reject(new Error('App icons are unavailable in the design preview.'));
  },
  openNotificationAccessSettings(): void {},
  setSelectedPackages(_packages: string[]): Promise<void> {
    return Promise.resolve();
  },
  prepareReceiver(): Promise<string> {
    return Promise.resolve('');
  },
  pairTransmitter(_pairingCode: string): Promise<void> {
    return Promise.resolve();
  },
  isReceiverPaired(): Promise<boolean> {
    return Promise.resolve(false);
  },
  resetPairing(): Promise<void> {
    return Promise.resolve();
  },
};

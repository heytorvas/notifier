export type DeviceRole = 'transmitter' | 'receiver';

export type InstalledApp = {
  packageName: string;
  name: string;
};

export type PeerDevice = {
  brand: string;
  model: string;
};

export type AlertRecord = {
  id: string;
  at: number;
  direction: 'in' | 'out';
  appName: string;
  packageName: string;
  title: string;
  text: string;
  status: 'pending' | 'delivered' | 'failed';
  detail: string;
};

export type DiagnosticRecord = {
  id: string;
  at: number;
  message: string;
};

export type NativeState = {
  role: DeviceRole | null;
  paired: boolean;
  notificationAccess: boolean;
  listenerConnected: boolean;
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
  listenerConnected: false,
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
  syncPairing(): Promise<NativeState> {
    return Promise.resolve(emptyState);
  },
  getAlerts(): Promise<AlertRecord[]> {
    return Promise.resolve([]);
  },
  getDiagnostics(): Promise<DiagnosticRecord[]> {
    return Promise.resolve([]);
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

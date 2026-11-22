import type { DeviceRole } from '../infrastructure/notifierGateway';

export type AlertDirection = 'in' | 'out';
export type AlertStatus = 'pending' | 'delivered' | 'failed';
export type ConnectionStatus = 'connected' | 'access-off' | 'reconnecting' | 'sender-down';
export type SenderListener = 'up' | 'down' | 'unknown';

export type AlertRecord = {
  id: string;
  at: number;
  direction: AlertDirection;
  appName: string;
  packageName: string;
  title: string;
  text: string;
  status: AlertStatus;
  detail: string;
};

export type DiagnosticRecord = {
  id: string;
  at: number;
  message: string;
};

type TimedRecord = {
  id: string;
  at: number;
};

export function connectionStatus(
  role: DeviceRole | null,
  notificationAccess: boolean,
  listenerConnected: boolean,
  senderListener: SenderListener = 'unknown',
): ConnectionStatus {
  if (!notificationAccess) return 'access-off';
  if (role === 'transmitter' && !listenerConnected) return 'reconnecting';
  if (role === 'receiver' && senderListener === 'down') return 'sender-down';
  return 'connected';
}

export function alertStatusLabel(direction: AlertDirection, status: AlertStatus): string {
  if (status === 'pending') return 'Pending';
  if (status === 'failed') return 'Failed';
  return direction === 'out' ? 'Sent' : 'Received';
}

export function byRecent<T extends TimedRecord>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => right.at - left.at || right.id.localeCompare(left.id));
}

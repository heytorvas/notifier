import {
  alertStatusLabel,
  byRecent,
  connectionStatus,
  type AlertRecord,
} from './activity';

describe('connectionStatus', () => {
  it('treats a granted listener permission with a dead service as reconnecting', () => {
    expect(connectionStatus('transmitter', true, false)).toBe('reconnecting');
  });

  it('asks for access only when the system permission is missing', () => {
    expect(connectionStatus('transmitter', false, false)).toBe('access-off');
    expect(connectionStatus('receiver', false, false)).toBe('access-off');
  });

  it('is connected when a transmitter listener is bound or a receiver can post', () => {
    expect(connectionStatus('transmitter', true, true)).toBe('connected');
    expect(connectionStatus('receiver', true, true, 'unknown')).toBe('connected');
    expect(connectionStatus('receiver', true, true, 'up')).toBe('connected');
  });

  it('does not call the receiver connected while the sender listener is down', () => {
    expect(connectionStatus('receiver', true, true, 'down')).toBe('sender-down');
    expect(connectionStatus('transmitter', true, true, 'down')).toBe('connected');
  });
});

describe('alert history presentation', () => {
  const older: AlertRecord = {
    id: 'a',
    at: 10,
    direction: 'out',
    appName: 'Bank',
    packageName: 'com.bank',
    title: 'Older',
    text: 'First',
    status: 'delivered',
    detail: '',
  };
  const newer: AlertRecord = { ...older, id: 'b', at: 20, title: 'Newer', status: 'failed' };

  it('orders alerts and diagnostics newest first', () => {
    expect(byRecent([older, newer]).map((record) => record.id)).toEqual(['b', 'a']);
    expect(byRecent([
      { id: 'b', at: 5 },
      { id: 'a', at: 5 },
    ]).map((record) => record.id)).toEqual(['b', 'a']);
  });

  it('labels delivery separately from send and receive failures', () => {
    expect(alertStatusLabel('out', 'delivered')).toBe('Sent');
    expect(alertStatusLabel('in', 'delivered')).toBe('Received');
    expect(alertStatusLabel('out', 'failed')).toBe('Failed');
    expect(alertStatusLabel('in', 'pending')).toBe('Pending');
  });
});

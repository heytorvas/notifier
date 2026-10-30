import { notifierGateway } from './notifierGateway.web';

const firebase = {
  applicationId: 'app',
  apiKey: 'key',
  projectId: 'project',
  senderId: 'sender',
};

describe('web notifier gateway', () => {
  it('resolves device calls without a native module', async () => {
    await expect(notifierGateway.configure('https://relay.example', firebase)).resolves.toBeUndefined();
    await expect(notifierGateway.getState()).resolves.toEqual({
      role: null,
      paired: false,
      notificationAccess: false,
      sensitiveContentLimited: false,
      selectedPackages: [],
      pairedAt: null,
      peer: null,
      transmittingApps: [],
    });
    await expect(notifierGateway.getInstalledApps()).resolves.toEqual([]);
    await expect(notifierGateway.prepareReceiver()).resolves.toBe('');
    await expect(notifierGateway.pairTransmitter('code')).resolves.toBeUndefined();
    await expect(notifierGateway.setSelectedPackages(['com.example.bank'])).resolves.toBeUndefined();
    await expect(notifierGateway.isReceiverPaired()).resolves.toBe(false);
    await expect(notifierGateway.resetPairing()).resolves.toBeUndefined();
    expect(notifierGateway.openNotificationAccessSettings()).toBeUndefined();
  });

  it('rejects icon lookups so screens keep their placeholders', async () => {
    await expect(notifierGateway.getAppIcon('com.example.bank')).rejects.toThrow(/design preview/);
  });
});

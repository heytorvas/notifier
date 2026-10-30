import { act, renderHook, waitFor } from '@testing-library/react-native';

import { NotifierProvider, useNotifier } from './NotifierProvider';
import { notifierGateway, type NativeState } from '../infrastructure/notifierGateway';

jest.mock('../config/environment', () => ({
  readEnvironment: () => ({
    relayUrl: 'https://relay.example',
    firebase: {
      applicationId: 'app',
      apiKey: 'key',
      projectId: 'project',
      senderId: 'sender',
    },
  }),
}));

jest.mock('../infrastructure/notifierGateway', () => ({
  notifierGateway: {
    configure: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn(),
    getInstalledApps: jest.fn().mockResolvedValue([]),
    prepareReceiver: jest.fn().mockResolvedValue('pairing-code'),
    pairTransmitter: jest.fn().mockResolvedValue(undefined),
    setSelectedPackages: jest.fn().mockResolvedValue(undefined),
    resetPairing: jest.fn().mockResolvedValue(undefined),
  },
}));

const freshState: NativeState = {
  role: null,
  paired: false,
  notificationAccess: false,
  sensitiveContentLimited: false,
  selectedPackages: [],
  pairedAt: null,
  peer: null,
  transmittingApps: [],
};

describe('NotifierProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(notifierGateway.getState).mockResolvedValue(freshState);
  });

  it('configures native services before exposing initialized state', async () => {
    const hook = await renderHook(() => useNotifier(), { wrapper: NotifierProvider });

    await waitFor(() => expect(hook.result.current.initialized).toBe(true));

    expect(notifierGateway.configure).toHaveBeenCalledTimes(1);
    expect(notifierGateway.getState).toHaveBeenCalledTimes(1);
    expect(notifierGateway.resetPairing).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual(freshState);
  });

  it('stores the receiver pairing code only after native setup succeeds', async () => {
    const receiverState = {
      ...freshState,
      role: 'receiver' as const,
      paired: true,
      notificationAccess: true,
    };
    jest.mocked(notifierGateway.getState)
      .mockResolvedValueOnce(freshState)
      .mockResolvedValueOnce(receiverState);
    const hook = await renderHook(() => useNotifier(), { wrapper: NotifierProvider });
    await waitFor(() => expect(hook.result.current.initialized).toBe(true));

    await act(() => hook.result.current.prepareReceiver());

    expect(hook.result.current.pairingCode).toBe('pairing-code');
    expect(hook.result.current.state).toEqual(receiverState);
    expect(hook.result.current.busy).toBe(false);
  });

  it('restores an unfinished receiver pairing flow after process restart', async () => {
    const unfinished = { ...freshState, role: 'receiver' as const };
    jest.mocked(notifierGateway.getState).mockResolvedValue(unfinished);

    const hook = await renderHook(() => useNotifier(), { wrapper: NotifierProvider });
    await waitFor(() => expect(hook.result.current.initialized).toBe(true));

    expect(notifierGateway.prepareReceiver).toHaveBeenCalledTimes(1);
    expect(hook.result.current.pairingCode).toBe('pairing-code');
    expect(hook.result.current.state).toEqual(unfinished);
  });

  it('always clears busy state when an operation fails', async () => {
    jest.mocked(notifierGateway.prepareReceiver).mockRejectedValueOnce(new Error('offline'));
    const hook = await renderHook(() => useNotifier(), { wrapper: NotifierProvider });
    await waitFor(() => expect(hook.result.current.initialized).toBe(true));

    await expect(act(() => hook.result.current.prepareReceiver())).rejects.toThrow('offline');

    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.pairingCode).toBeUndefined();
  });
});

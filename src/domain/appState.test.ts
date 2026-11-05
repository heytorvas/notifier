import type { NativeState } from '../infrastructure/notifierGateway';
import { resolveStartupDestination, type StartupDestination } from './appState';

const base: NativeState = {
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

describe('resolveStartupDestination', () => {
  const cases: {
    name: string;
    state: NativeState;
    expected: StartupDestination;
  }[] = [
    {
      name: 'fresh install',
      state: base,
      expected: 'role',
    },
    {
      name: 'restored receiver without decryptable credentials',
      state: { ...base, role: 'receiver', notificationAccess: true },
      expected: 'role',
    },
    {
      name: 'partially paired transmitter',
      state: {
        ...base,
        role: 'transmitter',
        notificationAccess: true,
        selectedPackages: ['com.bank'],
      },
      expected: 'role',
    },
    {
      name: 'paired transmitter without app selection',
      state: { ...base, role: 'transmitter', paired: true, notificationAccess: true },
      expected: 'apps',
    },
    {
      name: 'ready transmitter',
      state: {
        ...base,
        role: 'transmitter',
        paired: true,
        notificationAccess: true,
        selectedPackages: ['com.bank'],
      },
      expected: 'dashboard',
    },
    {
      name: 'ready receiver',
      state: { ...base, role: 'receiver', paired: true, notificationAccess: true },
      expected: 'dashboard',
    },
  ];

  it.each(cases)('routes $name to $expected', ({ state, expected }) => {
    expect(resolveStartupDestination(state)).toBe(expected);
  });
});

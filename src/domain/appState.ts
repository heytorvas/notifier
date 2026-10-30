import type { NativeState } from '../infrastructure/notifierGateway';

export type StartupDestination = 'role' | 'apps' | 'dashboard';

export function resolveStartupDestination(state: NativeState): StartupDestination {
  if (!state.role || !state.paired) return 'role';
  if (state.role === 'transmitter' && state.selectedPackages.length === 0) return 'apps';
  return 'dashboard';
}

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { readEnvironment } from '../config/environment';
import {
  notifierGateway,
  type AlertRecord,
  type DiagnosticRecord,
  type InstalledApp,
  type NativeState,
} from '../infrastructure/notifierGateway';

type NotifierContextValue = {
  state?: NativeState;
  apps: InstalledApp[];
  alerts: AlertRecord[];
  diagnostics: DiagnosticRecord[];
  pairingCode?: string;
  busy: boolean;
  initialized: boolean;
  startupError?: string;
  retryStartup: () => void;
  refreshState: () => Promise<NativeState>;
  syncPeer: () => Promise<NativeState>;
  loadApps: () => Promise<void>;
  prepareReceiver: () => Promise<void>;
  pairTransmitter: (code: string) => Promise<void>;
  saveSelection: (packages: string[]) => Promise<void>;
  resetPairing: () => Promise<void>;
};

const NotifierContext = createContext<NotifierContextValue | null>(null);

export function NotifierProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<NativeState>();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticRecord[]>([]);
  const [pairingCode, setPairingCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [startupError, setStartupError] = useState<string>();
  const [startupAttempt, setStartupAttempt] = useState(0);

  const refreshActivity = useCallback(async () => {
    const [nextAlerts, nextDiagnostics] = await Promise.all([
      notifierGateway.getAlerts(),
      notifierGateway.getDiagnostics(),
    ]);
    setAlerts(nextAlerts);
    setDiagnostics(nextDiagnostics);
  }, []);

  const refreshState = useCallback(async () => {
    const next = await notifierGateway.getState();
    setState(next);
    return next;
  }, []);

  const syncPeer = useCallback(async () => {
    const next = await notifierGateway.syncPairing();
    setState(next);
    await refreshActivity();
    return next;
  }, [refreshActivity]);

  const loadApps = useCallback(async () => {
    setApps(await notifierGateway.getInstalledApps());
  }, []);

  useEffect(() => {
    let active = true;
    const start = async () => {
      setInitialized(false);
      setStartupError(undefined);
      try {
        const environment = readEnvironment();
        await notifierGateway.configure(environment.relayUrl, environment.firebase);
        let next = await notifierGateway.getState();
        let restoredPairingCode: string | undefined;
        if (next.role === 'receiver' && !next.paired) {
          restoredPairingCode = await notifierGateway.prepareReceiver();
          next = await notifierGateway.getState();
        }
        if (active) {
          setState(next);
          setPairingCode(restoredPairingCode);
          setInitialized(true);
        }
      } catch (error) {
        if (active) setStartupError(toMessage(error));
      }
    };
    void start();
    return () => {
      active = false;
    };
  }, [startupAttempt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !state?.role) return;
      void (state.paired ? syncPeer() : refreshState()).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshState, state?.paired, state?.role, syncPeer]);

  const runBusy = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await operation();
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<NotifierContextValue>(
    () => ({
      state,
      apps,
      alerts,
      diagnostics,
      pairingCode,
      busy,
      initialized,
      startupError,
      retryStartup: () => setStartupAttempt((attempt) => attempt + 1),
      refreshState,
      syncPeer,
      loadApps,
      prepareReceiver: () =>
        runBusy(async () => {
          setPairingCode(await notifierGateway.prepareReceiver());
          await refreshState();
        }),
      pairTransmitter: (code) =>
        runBusy(async () => {
          await notifierGateway.pairTransmitter(code);
          await Promise.all([refreshState(), loadApps()]);
        }),
      saveSelection: (packages) =>
        runBusy(async () => {
          await notifierGateway.setSelectedPackages(packages);
          await refreshState();
        }),
      resetPairing: () =>
        runBusy(async () => {
          await notifierGateway.resetPairing();
          setState(await notifierGateway.getState());
          setPairingCode(undefined);
          setApps([]);
          setAlerts([]);
          setDiagnostics([]);
        }),
    }),
    [
      alerts,
      apps,
      busy,
      diagnostics,
      initialized,
      loadApps,
      pairingCode,
      refreshState,
      runBusy,
      syncPeer,
      startupError,
      state,
    ],
  );

  return <NotifierContext.Provider value={value}>{children}</NotifierContext.Provider>;
}

export function useNotifier(): NotifierContextValue {
  const value = useContext(NotifierContext);
  if (!value) throw new Error('useNotifier must be used inside NotifierProvider.');
  return value;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

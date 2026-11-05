import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestNotificationPermission } from '../application/notificationPermission';
import { useNotifier } from '../application/NotifierProvider';
import { orderInstalledApps } from '../domain/devices';
import { notifierGateway } from '../infrastructure/notifierGateway';
import { DashboardScreen } from '../ui/screens/DashboardScreen';
import { colors } from '../ui/theme';

export default function DashboardRoute() {
  const { alerts, apps, diagnostics, loadApps, resetPairing, state, syncPeer } = useNotifier();
  useEffect(() => {
    const tick = () => {
      void syncPeer().catch(() => undefined);
    };
    tick();
    const interval = setInterval(tick, 15_000);
    return () => clearInterval(interval);
  }, [syncPeer]);
  useEffect(() => {
    if (state?.role !== 'transmitter' || apps.length > 0) return;
    void loadApps().catch(() => undefined);
  }, [apps.length, loadApps, state?.role]);
  if (!state?.paired || !state.role) return <Redirect href="/" />;

  const reset = () => {
    Alert.alert(
      'Unpair this device?',
      'Pairing and selected apps will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: () => {
            void resetPairing()
              .then(() => router.replace('/role'))
              .catch((error: unknown) => {
                Alert.alert('Could not reset', error instanceof Error ? error.message : 'Please try again.');
              });
          },
        },
      ],
    );
  };

  const fixPermission = async () => {
    if (state.role === 'transmitter') {
      notifierGateway.openNotificationAccessSettings();
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) await Linking.openSettings();
    await syncPeer();
  };

  return (
    <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }}>
      <DashboardScreen
        alerts={alerts}
        apps={
          state.role === 'receiver'
            ? state.transmittingApps
            : orderInstalledApps(
                apps.filter((app) => state.selectedPackages.includes(app.packageName)),
                new Set(state.selectedPackages),
                '',
              )
        }
        diagnostics={diagnostics}
        listenerConnected={state.listenerConnected}
        notificationAccess={state.notificationAccess}
        onEditApps={() => {
          void loadApps()
            .then(() => router.push('/apps'))
            .catch((error: unknown) => {
              Alert.alert('Could not load apps', error instanceof Error ? error.message : 'Please try again.');
            });
        }}
        onFixPermission={() => void fixPermission().catch(showError)}
        onReset={reset}
        pairedAt={state.pairedAt}
        peer={state.peer}
        role={state.role}
        sensitiveContentLimited={state.sensitiveContentLimited}
      />
    </SafeAreaView>
  );
}

function showError(error: unknown): void {
  Alert.alert('Could not restore permission', error instanceof Error ? error.message : 'Please try again.');
}

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotifier } from '../application/NotifierProvider';
import { AppSelectionScreen } from '../ui/screens/AppSelectionScreen';
import { colors } from '../ui/theme';

export default function AppsRoute() {
  const { apps, busy, loadApps, saveSelection, state } = useNotifier();
  const [loading, setLoading] = useState(apps.length === 0);

  useEffect(() => {
    if (apps.length > 0) return;
    void loadApps()
      .catch((error: unknown) => {
        Alert.alert('Could not load apps', error instanceof Error ? error.message : 'Please try again.');
      })
      .finally(() => setLoading(false));
  }, [apps.length, loadApps]);

  if (!state?.paired || state.role !== 'transmitter') return <Redirect href="/" />;
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.ink} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppSelectionScreen
        apps={apps}
        initialSelection={state.selectedPackages}
        notificationAccess={state.notificationAccess}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/dashboard');
        }}
        onSave={(packages) => {
          void saveSelection(packages)
            .then(() => router.replace('/dashboard'))
            .catch((error: unknown) => {
              Alert.alert('Could not save selection', error instanceof Error ? error.message : 'Please try again.');
            });
        }}
        saving={busy}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});

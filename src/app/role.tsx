import { router } from 'expo-router';
import { ActivityIndicator, Alert, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestNotificationPermission } from '../application/notificationPermission';
import { useNotifier } from '../application/NotifierProvider';
import type { DeviceRole } from '../infrastructure/notifierGateway';
import { Wordmark } from '../ui/components/Mark';
import { RoleScreen } from '../ui/screens/RoleScreen';
import { colors, spacing } from '../ui/theme';

export default function RoleRoute() {
  const { busy, prepareReceiver } = useNotifier();

  const chooseRole = async (role: DeviceRole) => {
    if (role === 'transmitter') {
      router.push('/pair-transmitter');
      return;
    }
    if (!(await requestNotificationPermission())) {
      Alert.alert(
        'Notifications are disabled',
        'Notifier needs permission to show mirrored alerts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    try {
      await prepareReceiver();
      router.replace('/pair-receiver');
    } catch (error) {
      showError(error);
    }
  };

  if (busy) {
    return (
      <SafeAreaView style={styles.centered}>
        <Wordmark />
        <ActivityIndicator color={colors.ink} style={styles.spinner} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <RoleScreen onChoose={(role) => void chooseRole(role)} />
    </SafeAreaView>
  );
}

function showError(error: unknown): void {
  Alert.alert('Could not create receiver', error instanceof Error ? error.message : 'Please try again.');
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
    gap: spacing.md,
    justifyContent: 'center',
  },
  spinner: {
    marginTop: spacing.lg,
  },
});

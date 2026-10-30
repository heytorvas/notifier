import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotifier } from '../application/NotifierProvider';
import { resolveStartupDestination } from '../domain/appState';
import { AppText } from '../ui/components/AppText';
import { Wordmark } from '../ui/components/Mark';
import { PrimaryButton } from '../ui/components/PrimaryButton';
import { colors, spacing } from '../ui/theme';

export default function StartupRoute() {
  const { initialized, retryStartup, startupError, state } = useNotifier();

  if (startupError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Wordmark />
        <AppText weight="medium" style={styles.title}>
          Could not start
        </AppText>
        <AppText tone="danger" style={styles.error}>
          {startupError}
        </AppText>
        <PrimaryButton label="Retry" onPress={retryStartup} />
      </SafeAreaView>
    );
  }

  if (!initialized || !state) {
    return (
      <SafeAreaView style={styles.centered}>
        <Wordmark />
        <ActivityIndicator color={colors.ink} style={styles.spinner} />
      </SafeAreaView>
    );
  }

  return <Redirect href={`/${resolveStartupDestination(state)}`} />;
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  error: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  spinner: {
    marginTop: spacing.lg,
  },
});

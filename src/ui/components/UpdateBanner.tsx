import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import { AppText } from './AppText';

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!Updates.isEnabled) return;
    let active = true;
    void Updates.checkForUpdateAsync()
      .then((result) => {
        if (active && result.isAvailable) setAvailable(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  const apply = () => {
    if (applying) return;
    setApplying(true);
    void Updates.fetchUpdateAsync()
      .then(() => Updates.reloadAsync())
      .catch(() => setApplying(false));
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={apply}
      style={[styles.banner, { paddingTop: insets.top + spacing.md }]}
    >
      <AppText weight="medium" style={styles.label}>
        Update available
      </AppText>
      <View style={styles.action}>
        <AppText weight="medium" style={styles.label}>
          {applying ? 'Installing' : 'Install'}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: {
    color: colors.onPrimary,
  },
  action: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});

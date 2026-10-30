import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { Mark } from './Mark';

type Props = {
  onBack?: () => void;
  screen?: string;
  trailing?: ReactNode;
};

export function ScreenHeader({ onBack, screen, trailing }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        {onBack ? (
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Chevron direction="left" />
          </Pressable>
        ) : null}
        <Mark size={28} />
        <AppText numberOfLines={1} weight="medium" style={styles.name}>
          Notifier
        </AppText>
      </View>
      {trailing ??
        (screen ? (
          <AppText numberOfLines={1} tone="muted" style={styles.screen}>
            {screen}
          </AppText>
        ) : null)}
    </View>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return <View style={direction === 'left' ? styles.chevron : styles.chevronRight} />;
}

export { Chevron };

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  brand: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  back: {
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  backPressed: {
    backgroundColor: colors.gray200,
  },
  chevron: {
    borderColor: colors.ink,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    height: 10,
    marginLeft: 4,
    transform: [{ rotate: '-45deg' }],
    width: 10,
  },
  chevronRight: {
    borderColor: colors.inkFaint,
    borderRightWidth: 2,
    borderTopWidth: 2,
    height: 10,
    marginRight: 2,
    transform: [{ rotate: '45deg' }],
    width: 10,
  },
  name: {
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 24,
  },
  screen: {
    fontSize: 15,
    lineHeight: 20,
  },
});

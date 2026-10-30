import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme';
import { AppText } from './AppText';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function TextAction({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: Props) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <AppText weight="medium" style={styles.link}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  link: {
    color: colors.link,
  },
  pressed: {
    opacity: 0.55,
  },
  disabled: {
    opacity: 0.4,
  },
});

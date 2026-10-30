import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor[variant].color} />
      ) : (
        <AppText weight="medium" style={labelColor[variant]}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.lg,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.45,
  },
});

const labelColor = StyleSheet.create({
  primary: { color: colors.onPrimary },
  secondary: { color: colors.ink },
  danger: { color: colors.white },
});

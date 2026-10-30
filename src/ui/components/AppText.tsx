import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '../theme';

type Props = TextProps & {
  weight?: 'regular' | 'medium';
  tone?: 'primary' | 'muted' | 'faint' | 'danger';
};

export function AppText({ weight = 'regular', tone = 'primary', style, ...props }: Props) {
  return <Text {...props} style={[styles[weight], styles[tone], style]} />;
}

const styles = StyleSheet.create({
  regular: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  medium: {
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 22,
  },
  primary: {
    color: colors.ink,
  },
  muted: {
    color: colors.inkMuted,
  },
  faint: {
    color: colors.inkFaint,
  },
  danger: {
    color: colors.danger,
  },
});

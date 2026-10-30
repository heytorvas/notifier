import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { DeviceRole } from '../../infrastructure/notifierGateway';
import { AppText } from '../components/AppText';
import { Chevron, ScreenHeader } from '../components/ScreenHeader';
import { colors, radius, spacing } from '../theme';

type Props = {
  onChoose: (role: DeviceRole) => void;
};

export function RoleScreen({ onChoose }: Props) {
  return (
    <View style={styles.container}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={styles.body}>
        <AppText tone="muted">Mirror notifications between two devices.</AppText>
        <View style={styles.menu}>
          <RoleRow
            description="From the apps you choose."
            filled
            glyph="↑"
            onPress={() => onChoose('transmitter')}
            title="Send"
          />
          <View style={styles.divider} />
          <RoleRow
            description="On this device."
            glyph="↓"
            onPress={() => onChoose('receiver')}
            title="Receive"
          />
        </View>
      </ScrollView>
    </View>
  );
}

type RoleRowProps = {
  title: string;
  description: string;
  glyph: string;
  filled?: boolean;
  onPress: () => void;
};

function RoleRow({ title, description, glyph, filled = false, onPress }: RoleRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.glyph, filled ? styles.glyphFilled : styles.glyphOpen]}>
        <AppText
          tone="primary"
          weight="medium"
          style={[styles.glyphText, filled && styles.glyphTextFilled]}
        >
          {glyph}
        </AppText>
      </View>
      <View style={styles.copy}>
        <AppText weight="medium">{title}</AppText>
        <AppText tone="muted">{description}</AppText>
      </View>
      <Chevron direction="right" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginLeft: 72,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.gray100,
  },
  glyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  glyphFilled: {
    backgroundColor: colors.primary,
  },
  glyphOpen: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  glyphText: {
    fontSize: 18,
    lineHeight: 22,
  },
  glyphTextFilled: {
    color: colors.onPrimary,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});

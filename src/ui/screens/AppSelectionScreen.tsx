import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { orderInstalledApps } from '../../domain/devices';
import { notifierGateway, type InstalledApp } from '../../infrastructure/notifierGateway';
import { AppIcon } from '../components/AppIcon';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextAction } from '../components/TextAction';
import { colors, radius, spacing } from '../theme';

type Props = {
  apps: InstalledApp[];
  initialSelection: string[];
  notificationAccess: boolean;
  saving: boolean;
  onBack?: () => void;
  onSave: (packages: string[]) => void;
};

export function AppSelectionScreen({
  apps,
  initialSelection,
  notificationAccess,
  saving,
  onBack,
  onSave,
}: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set(initialSelection));
  const visibleApps = useMemo(
    () => orderInstalledApps(apps, selected, query),
    [apps, query, selected],
  );

  const toggle = (packageName: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(packageName)) next.delete(packageName);
      else next.add(packageName);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader onBack={onBack} screen="Apps" />
      <View style={styles.intro}>
        <AppText weight="medium" style={styles.heading}>
          Choose apps
        </AppText>
        <AppText tone="muted">Alerts from these apps are mirrored.</AppText>
      </View>

      {!notificationAccess && (
        <View style={styles.permission}>
          <AppText weight="medium">Notification access</AppText>
          <TextAction label="Settings" onPress={() => notifierGateway.openNotificationAccessSettings()} />
        </View>
      )}

      <TextInput
        accessibilityLabel="Search installed apps"
        autoCapitalize="none"
        onChangeText={setQuery}
        placeholder="Search apps"
        placeholderTextColor={colors.inkFaint}
        style={styles.search}
        value={query}
      />

      <FlatList
        contentContainerStyle={styles.list}
        style={styles.listView}
        data={visibleApps}
        initialNumToRender={12}
        keyExtractor={(app) => app.packageName}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <AppRow
            app={item}
            onPress={() => toggle(item.packageName)}
            selected={selected.has(item.packageName)}
          />
        )}
        windowSize={7}
      />

      <View style={styles.footer}>
        <AppText tone="muted">{selected.size} selected</AppText>
        <View style={styles.save}>
          <PrimaryButton
            disabled={selected.size === 0 || !notificationAccess}
            label="Save"
            loading={saving}
            onPress={() => onSave(Array.from(selected))}
          />
        </View>
      </View>
    </View>
  );
}

type AppRowProps = {
  app: InstalledApp;
  selected: boolean;
  onPress: () => void;
};

function AppRow({ app, selected, onPress }: AppRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
    >
      <AppIcon packageName={app.packageName} />
      <AppText numberOfLines={1} style={styles.name}>
        {app.name}
      </AppText>
      <View style={[styles.box, selected && styles.boxSelected]}>
        {selected ? (
          <AppText style={styles.check}>✓</AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  intro: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
  },
  permission: {
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: 'Geist',
    fontSize: 16,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  listView: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  row: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  rowSelected: {
    backgroundColor: colors.gray100,
  },
  rowPressed: {
    opacity: 0.6,
  },
  name: {
    flex: 1,
  },
  box: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  boxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  check: {
    color: colors.onPrimary,
    fontSize: 14,
    lineHeight: 16,
  },
  footer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  save: {
    flex: 1,
  },
});

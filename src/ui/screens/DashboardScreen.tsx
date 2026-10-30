import { ScrollView, StyleSheet, View } from 'react-native';

import { formatDeviceName, formatPairedAt } from '../../domain/devices';
import type { DeviceRole, InstalledApp, PeerDevice } from '../../infrastructure/notifierGateway';
import { AppIcon } from '../components/AppIcon';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextAction } from '../components/TextAction';
import { colors, radius, spacing } from '../theme';

type Props = {
  role: DeviceRole;
  notificationAccess: boolean;
  sensitiveContentLimited: boolean;
  peer: PeerDevice | null;
  pairedAt: number | null;
  apps: InstalledApp[];
  onEditApps: () => void;
  onFixPermission: () => void;
  onReset: () => void;
};

export function DashboardScreen({
  role,
  notificationAccess,
  sensitiveContentLimited,
  peer,
  pairedAt,
  apps,
  onEditApps,
  onFixPermission,
  onReset,
}: Props) {
  const deviceName = peer ? formatDeviceName(peer.brand, peer.model) : '';
  const pairedLabel = formatPairedAt(pairedAt);
  const sending = role === 'transmitter';

  return (
    <View style={styles.container}>
      <ScreenHeader
        trailing={
          <View style={styles.pill}>
            <View style={[styles.pip, sending ? styles.pipSend : styles.pipReceive]} />
            <AppText weight="medium" style={styles.pillLabel}>
              {sending ? 'Sending' : 'Receiving'}
            </AppText>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.status}>
            <View style={[styles.dot, notificationAccess ? styles.dotOn : styles.dotOff]} />
            <AppText weight="medium">{notificationAccess ? 'Connected' : 'Access off'}</AppText>
          </View>
          {sensitiveContentLimited ? (
            <AppText tone="faint">Android may redact some alerts.</AppText>
          ) : null}
          {!notificationAccess ? <PrimaryButton label="Allow access" onPress={onFixPermission} /> : null}
        </View>

        {deviceName ? (
          <View style={styles.card}>
            <AppText tone="faint" style={styles.label}>
              Other device
            </AppText>
            <AppText weight="medium">{deviceName}</AppText>
            {pairedLabel ? <AppText tone="faint">{pairedLabel}</AppText> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText weight="medium">{sending ? 'Sending from' : 'Receiving from'}</AppText>
            {sending ? (
              <TextAction accessibilityLabel="Edit apps" label="Edit" onPress={onEditApps} />
            ) : null}
          </View>
          {apps.length === 0 ? (
            <AppText tone="faint">{sending ? 'None selected' : 'None yet'}</AppText>
          ) : (
            apps.map((app) => (
              <View key={app.packageName} style={styles.app}>
                <AppIcon packageName={app.packageName} />
                <AppText numberOfLines={1} style={styles.appName}>
                  {app.name}
                </AppText>
              </View>
            ))
          )}
        </View>

        <View style={styles.unpair}>
          <PrimaryButton label="Unpair" onPress={onReset} variant="danger" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    padding: spacing.xl,
  },
  pill: {
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pip: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  pipSend: {
    backgroundColor: colors.ink,
  },
  pipReceive: {
    backgroundColor: colors.success,
  },
  pillLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotOn: {
    backgroundColor: colors.success,
  },
  dotOff: {
    backgroundColor: colors.warning,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  app: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 44,
  },
  appName: {
    flex: 1,
  },
  unpair: {
    marginTop: spacing.sm,
  },
});

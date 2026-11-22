import { ScrollView, StyleSheet, View } from 'react-native';

import {
  alertStatusLabel,
  byRecent,
  connectionStatus,
  type AlertRecord,
  type DiagnosticRecord,
  type SenderListener,
} from '../../domain/activity';
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
  listenerConnected: boolean;
  senderListener?: SenderListener;
  sensitiveContentLimited: boolean;
  peer: PeerDevice | null;
  pairedAt: number | null;
  apps: InstalledApp[];
  alerts: AlertRecord[];
  diagnostics: DiagnosticRecord[];
  onEditApps: () => void;
  onFixPermission: () => void;
  onReset: () => void;
};

export function DashboardScreen({
  role,
  notificationAccess,
  listenerConnected,
  senderListener = 'unknown',
  sensitiveContentLimited,
  peer,
  pairedAt,
  apps,
  alerts,
  diagnostics,
  onEditApps,
  onFixPermission,
  onReset,
}: Props) {
  const deviceName = peer ? formatDeviceName(peer.brand, peer.model) : '';
  const pairedLabel = formatPairedAt(pairedAt);
  const sending = role === 'transmitter';
  const connection = connectionStatus(role, notificationAccess, listenerConnected, senderListener);
  const recentAlerts = byRecent(alerts);
  const recentDiagnostics = byRecent(diagnostics);

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
            <View style={[styles.dot, connection === 'connected' ? styles.dotOn : styles.dotOff]} />
            <AppText weight="medium">{connectionLabel[connection]}</AppText>
          </View>
          {connection === 'reconnecting' ? <AppText tone="faint">{reconnectingHint}</AppText> : null}
          {connection === 'sender-down' ? <AppText tone="faint">{senderDownHint}</AppText> : null}
          {connection === 'reconnecting' ? (
            <TextAction
              accessibilityLabel="Notification access"
              label="Notification access"
              onPress={onFixPermission}
            />
          ) : null}
          {sensitiveContentLimited ? (
            <AppText tone="faint">Android may redact some alerts.</AppText>
          ) : null}
          {connection === 'access-off' ? <PrimaryButton label="Allow access" onPress={onFixPermission} /> : null}
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

        <View style={styles.card}>
          <AppText weight="medium">Alerts</AppText>
          <ScrollView nestedScrollEnabled style={styles.fixedList}>
            {recentAlerts.length === 0 ? (
              <AppText tone="faint">No alerts yet</AppText>
            ) : (
              recentAlerts.map((alert) => {
                const when = formatPairedAt(alert.at);
                const status = [alertStatusLabel(alert.direction, alert.status), alert.detail, when]
                  .filter((part): part is string => Boolean(part))
                  .join(' · ');
                return (
                  <View key={alert.id} style={styles.alertRow}>
                    <AppIcon packageName={alert.packageName} />
                    <View style={styles.alertCopy}>
                      <AppText numberOfLines={1} weight="medium">
                        {alert.appName || 'Alert'}
                      </AppText>
                      {alert.title ? <AppText numberOfLines={2}>{alert.title}</AppText> : null}
                      {alert.text ? (
                        <AppText numberOfLines={3} tone="muted">
                          {alert.text}
                        </AppText>
                      ) : null}
                      <AppText tone={alert.status === 'failed' ? 'danger' : 'faint'}>{status}</AppText>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <AppText weight="medium">Activity</AppText>
          <ScrollView nestedScrollEnabled style={styles.fixedList}>
            {recentDiagnostics.length === 0 ? (
              <AppText tone="faint">No activity yet</AppText>
            ) : (
              recentDiagnostics.map((entry) => (
                <View key={entry.id} style={styles.activityRow}>
                  <AppText tone="muted">{entry.message}</AppText>
                  {formatPairedAt(entry.at) ? (
                    <AppText tone="faint">{formatPairedAt(entry.at)}</AppText>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        </View>

        <View style={styles.unpair}>
          <PrimaryButton label="Unpair" onPress={onReset} variant="danger" />
        </View>
      </ScrollView>
    </View>
  );
}

const reconnectingHint =
  'Android already allows notification access. Notifier is restarting the listener. If this stays, turn Notifier off and on in notification access.';

const senderDownHint = 'The sending device is not reading notifications.';

const connectionLabel = {
  connected: 'Connected',
  'access-off': 'Access off',
  reconnecting: 'Reconnecting',
  'sender-down': 'Not delivering',
} as const;

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
  alertCopy: {
    flex: 1,
    gap: 2,
  },
  alertRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  fixedList: {
    height: 220,
  },
  activityRow: {
    gap: 2,
    paddingVertical: spacing.sm,
  },
  unpair: {
    marginTop: spacing.sm,
  },
});

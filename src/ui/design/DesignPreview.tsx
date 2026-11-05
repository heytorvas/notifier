import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DeviceRole } from '../../infrastructure/notifierGateway';
import { AppSelectionScreen } from '../screens/AppSelectionScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PairReceiverScreen } from '../screens/PairReceiverScreen';
import { PairTransmitterScreen } from '../screens/PairTransmitterScreen';
import { RoleScreen } from '../screens/RoleScreen';
import { colors, radius, spacing } from '../theme';

type ScreenId =
  | 'role'
  | 'scan'
  | 'pair'
  | 'send-ready'
  | 'send-blocked'
  | 'receive-ready'
  | 'receive-blocked'
  | 'otp-limit'
  | 'apps';

const screens: { id: ScreenId; label: string }[] = [
  { id: 'role', label: 'Role' },
  { id: 'scan', label: 'Scan' },
  { id: 'pair', label: 'Pair' },
  { id: 'send-ready', label: 'Send ready' },
  { id: 'send-blocked', label: 'Send blocked' },
  { id: 'receive-ready', label: 'Receiver' },
  { id: 'receive-blocked', label: 'Receiver blocked' },
  { id: 'otp-limit', label: 'OTP limit' },
  { id: 'apps', label: 'Apps' },
];

const previewApps = [
  { name: 'Example Bank', packageName: 'com.example.bank' },
  { name: 'Mail', packageName: 'com.example.mail' },
  { name: 'Messages', packageName: 'com.example.messages' },
];

const previewPairingCode = 'preview-pairing-code.not-a-real-key.design-only';

const previewAlerts = [
  {
    id: 'alert-1',
    at: 1_700_000_000_000,
    direction: 'out' as const,
    appName: 'Example Bank',
    packageName: 'com.example.bank',
    title: 'Payment',
    text: 'A transfer was posted.',
    status: 'delivered' as const,
    detail: '',
  },
];

const previewDiagnostics = [
  { id: 'diagnostic-1', at: 1_700_000_000_000, message: 'Listener connected' },
];

export function DesignPreview() {
  const [screen, setScreen] = useState<ScreenId>('role');

  const chooseRole = (role: DeviceRole) => {
    setScreen(role === 'transmitter' ? 'scan' : 'pair');
  };

  return (
    <View style={styles.page}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.switcherContent}
        showsHorizontalScrollIndicator={false}
        style={styles.switcher}
      >
        {screens.map((item) => {
          const selected = item.id === screen;
          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item.id}
              onPress={() => setScreen(item.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.stage}>
        <View style={styles.phone}>{renderScreen(screen, setScreen, chooseRole)}</View>
      </View>
    </View>
  );
}

function renderScreen(
  screen: ScreenId,
  setScreen: (screen: ScreenId) => void,
  chooseRole: (role: DeviceRole) => void,
) {
  if (screen === 'role') return <RoleScreen onChoose={chooseRole} />;
  if (screen === 'scan') {
    return (
      <PairTransmitterScreen
        camera="preview"
        loading={false}
        onCancel={() => setScreen('role')}
        onPair={async () => {
          setScreen('apps');
          return true;
        }}
      />
    );
  }
  if (screen === 'pair') {
    return (
      <PairReceiverScreen
        onCancel={() => setScreen('role')}
        onDone={() => setScreen('receive-ready')}
        pairingCode={previewPairingCode}
      />
    );
  }
  if (screen === 'apps') {
    return (
      <AppSelectionScreen
        apps={previewApps}
        initialSelection={['com.example.bank']}
        notificationAccess
        onBack={() => setScreen('send-ready')}
        onSave={() => setScreen('send-ready')}
        saving={false}
      />
    );
  }

  const role: DeviceRole = screen.startsWith('send') ? 'transmitter' : 'receiver';
  const notificationAccess = screen === 'send-ready' || screen === 'receive-ready' || screen === 'otp-limit';
  return (
    <DashboardScreen
      alerts={previewAlerts}
      apps={[{ packageName: 'com.example.bank', name: 'Example Bank' }]}
      diagnostics={previewDiagnostics}
      listenerConnected={notificationAccess}
      notificationAccess={notificationAccess}
      onEditApps={() => setScreen('apps')}
      onFixPermission={() => setScreen(role === 'transmitter' ? 'send-ready' : 'receive-ready')}
      onReset={() => setScreen('role')}
      pairedAt={1_700_000_000_000}
      peer={{ brand: 'Google', model: 'Pixel 8' }}
      role={role}
      sensitiveContentLimited={screen === 'otp-limit'}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.gray200,
    flex: 1,
    minHeight: '100%',
  },
  switcher: {
    flexGrow: 0,
    maxHeight: 64,
  },
  switcherContent: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelSelected: {
    color: colors.onPrimary,
  },
  stage: {
    alignItems: 'center',
    flex: 1,
  },
  phone: {
    backgroundColor: colors.background,
    flex: 1,
    maxWidth: 390,
    minHeight: 760,
    width: '100%',
  },
});

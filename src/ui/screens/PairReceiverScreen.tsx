import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { pairingFingerprint } from '../../domain/devices';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextAction } from '../components/TextAction';
import { colors, radius, spacing } from '../theme';

type Props = {
  pairingCode: string;
  onDone: () => void;
  onCancel: () => void;
};

export function PairReceiverScreen({ pairingCode, onDone, onCancel }: Props) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const fingerprint = pairingFingerprint(pairingCode);

  const copy = () => {
    void Clipboard.setStringAsync(pairingCode)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <View style={styles.container}>
      <ScreenHeader onBack={onCancel} screen="Pair" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.intro}>
          <AppText weight="medium" style={styles.heading}>
            Show this code
          </AppText>
          <AppText tone="muted">The other device scans it, or you paste it there.</AppText>
        </View>

        <View style={styles.card}>
          <View style={styles.qr}>
            <QRCode backgroundColor={colors.white} color={colors.black} size={220} value={pairingCode} />
          </View>
          <View style={styles.codeRow}>
            <AppText weight="medium" style={fingerprint ? styles.fingerprint : undefined}>
              {fingerprint ?? 'Pairing code'}
            </AppText>
            <TextAction label={copied ? 'Copied' : 'Copy'} onPress={copy} />
          </View>
          <TextAction
            label={revealed ? 'Hide code' : 'Show code'}
            onPress={() => setRevealed((current) => !current)}
          />
          {revealed ? (
            <View style={styles.secret}>
              <AppText selectable tone="muted" style={styles.secretText}>
                {pairingCode}
              </AppText>
            </View>
          ) : null}
        </View>

        <PrimaryButton label="Done" onPress={onDone} />
      </ScrollView>
    </View>
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
  intro: {
    gap: spacing.xs,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  qr: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  codeRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fingerprint: {
    fontSize: 28,
    letterSpacing: 3,
    lineHeight: 34,
  },
  secret: {
    alignSelf: 'stretch',
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  secretText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';

import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextAction } from '../components/TextAction';
import { colors, radius, spacing } from '../theme';

type Props = {
  loading: boolean;
  onPair: (code: string) => Promise<boolean>;
  onCancel: () => void;
  camera?: 'device' | 'preview';
};

export function PairTransmitterScreen({ loading, onPair, onCancel, camera = 'device' }: Props) {
  const [manualCode, setManualCode] = useState('');

  const paste = async () => {
    const value = (await Clipboard.getStringAsync()).trim();
    if (!value) return;
    setManualCode(value);
    await onPair(value);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader onBack={onCancel} screen="Scan" />
      <View style={styles.intro}>
        <AppText weight="medium" style={styles.heading}>
          Scan the code
        </AppText>
        <AppText tone="muted">Or paste it from the other device.</AppText>
      </View>
      <View style={styles.cameraFrame}>
        {camera === 'device' ? (
          <DeviceCamera loading={loading} onPair={onPair} />
        ) : (
          <View style={styles.permission}>
            <PrimaryButton label="Allow camera" onPress={() => undefined} variant="secondary" />
          </View>
        )}
      </View>
      <View style={styles.composer}>
        <View style={styles.field}>
          <TextInput
            accessibilityLabel="Manual pairing code"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            multiline
            onChangeText={setManualCode}
            placeholder="Pairing code"
            placeholderTextColor={colors.inkFaint}
            style={styles.input}
            value={manualCode}
          />
          <TextAction disabled={loading} label="Paste" onPress={() => void paste()} />
        </View>
        <PrimaryButton
          disabled={!manualCode.trim()}
          label="Pair"
          loading={loading}
          onPress={() => void onPair(manualCode.trim())}
        />
      </View>
    </View>
  );
}

function DeviceCamera({
  loading,
  onPair,
}: {
  loading: boolean;
  onPair: (code: string) => Promise<boolean>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleScan = ({ data }: BarcodeScanningResult) => {
    if (scanned || loading) return;
    setScanned(true);
    void onPair(data).then((paired) => {
      if (!paired) setScanned(false);
    });
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permission}>
        <PrimaryButton label="Allow camera" onPress={() => void requestPermission()} variant="secondary" />
      </View>
    );
  }

  return (
    <CameraView
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={handleScan}
      style={StyleSheet.absoluteFill}
    />
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
  cameraFrame: {
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    flex: 1,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    minHeight: 120,
    overflow: 'hidden',
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  composer: {
    gap: spacing.md,
    padding: spacing.xl,
  },
  field: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontFamily: 'Geist',
    fontSize: 16,
    maxHeight: 88,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
});

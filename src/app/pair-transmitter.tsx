import { Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotifier } from '../application/NotifierProvider';
import { PairTransmitterScreen } from '../ui/screens/PairTransmitterScreen';
import { colors } from '../ui/theme';

export default function PairTransmitterRoute() {
  const { busy, pairTransmitter } = useNotifier();

  const pair = async (code: string): Promise<boolean> => {
    try {
      await pairTransmitter(code);
      router.replace('/apps');
      return true;
    } catch (error) {
      Alert.alert(
        'Invalid or expired pairing code',
        error instanceof Error ? error.message : 'Generate a new code on the receiver.',
      );
      return false;
    }
  };

  return (
    <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }}>
      <PairTransmitterScreen
        loading={busy}
        onCancel={() => router.back()}
        onPair={pair}
      />
    </SafeAreaView>
  );
}

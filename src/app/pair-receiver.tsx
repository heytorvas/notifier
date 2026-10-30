import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Redirect, router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotifier } from '../application/NotifierProvider';
import { notifierGateway } from '../infrastructure/notifierGateway';
import { PairReceiverScreen } from '../ui/screens/PairReceiverScreen';
import { colors } from '../ui/theme';

export default function PairReceiverRoute() {
  usePreventScreenCapture('pairing-secret');
  const { pairingCode, refreshState, resetPairing } = useNotifier();

  useEffect(() => {
    if (!pairingCode) return;
    let active = true;
    let checking = false;
    const interval = setInterval(() => {
      if (checking) return;
      checking = true;
      void notifierGateway
        .isReceiverPaired()
        .then(async (paired) => {
          if (active && paired) {
            await refreshState();
            if (active) router.replace('/dashboard');
          }
        })
        .catch(() => undefined)
        .finally(() => {
          checking = false;
        });
    }, 3_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pairingCode, refreshState]);

  if (!pairingCode) return <Redirect href="/" />;

  const cancel = () => {
    Alert.alert('Cancel pairing?', 'This pairing code will be discarded.', [
      { text: 'Keep pairing', style: 'cancel' },
      {
        text: 'Cancel pairing',
        style: 'destructive',
        onPress: () => {
          void resetPairing()
            .then(() => router.replace('/role'))
            .catch((error: unknown) => {
              Alert.alert('Could not reset', error instanceof Error ? error.message : 'Please try again.');
            });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }}>
      <PairReceiverScreen
        onCancel={cancel}
        onDone={() => {
          void notifierGateway
            .isReceiverPaired()
            .then(async (paired) => {
              if (paired) {
                await refreshState();
                router.replace('/dashboard');
              } else {
                Alert.alert('Still waiting', 'The other device has not connected yet.');
              }
            })
            .catch((error: unknown) => {
              Alert.alert('Could not check pairing', error instanceof Error ? error.message : 'Please try again.');
            });
        }}
        pairingCode={pairingCode}
      />
    </SafeAreaView>
  );
}

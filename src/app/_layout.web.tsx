import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppFonts } from '../ui/fonts';
import { colors } from '../ui/theme';

export default function WebLayout() {
  return (
    <AppFonts>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            animation: 'fade',
            contentStyle: { backgroundColor: colors.background },
            headerShown: false,
          }}
        />
      </SafeAreaProvider>
    </AppFonts>
  );
}

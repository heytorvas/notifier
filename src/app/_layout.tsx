import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotifierProvider } from '../application/NotifierProvider';
import { UpdateBanner } from '../ui/components/UpdateBanner';
import { AppFonts } from '../ui/fonts';
import { colors } from '../ui/theme';

export default function RootLayout() {
  return (
    <AppFonts>
      <SafeAreaProvider>
        <NotifierProvider>
          <StatusBar style="light" />
          <UpdateBanner />
          <Stack
            screenOptions={{
              animation: 'fade',
              contentStyle: { backgroundColor: colors.background },
              headerShown: false,
            }}
          />
        </NotifierProvider>
      </SafeAreaProvider>
    </AppFonts>
  );
}

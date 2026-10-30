import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { type PropsWithChildren, useEffect } from 'react';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export function AppFonts({ children }: PropsWithChildren) {
  const [loaded] = useFonts({
    Geist: require('../../assets/fonts/Geist-Regular.ttf'),
    GeistMedium: require('../../assets/fonts/Geist-Medium.ttf'),
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return null;
  return children;
}

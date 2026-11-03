import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast, ToastHost } from '../components/Toast';
import { loadCaptures } from '../features/gallery/mediaRepository';
import { recoverInterruptedCaptures } from '../features/media/recoveryService';
import { cleanTemporaryFiles } from '../features/media/temporaryFileService';
import { loadSettings } from '../features/settings/settingsService';
import { loadStampFonts } from '../features/stamping/stampFonts';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
    Promise.allSettled([loadSettings(), loadCaptures(), loadStampFonts()]).finally(() => {
      // Leftovers from an interrupted session (app killed mid-processing). Only files
      // older than an hour are removed, so nothing currently in use is touched.
      cleanTemporaryFiles(60 * 60 * 1000);
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
      // Captures interrupted by a crash or forced close are saved unstamped.
      recoverInterruptedCaptures()
        .then((count) => {
          if (count > 0) {
            showToast(
              count === 1
                ? 'A capture interrupted earlier was saved without its stamp.'
                : `${count} captures interrupted earlier were saved without their stamp.`,
              'warning',
            );
          }
        })
        .catch(() => {});
    });
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
            animationDuration: 150,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="camera" options={{ headerShown: false }} />
          <Stack.Screen name="gallery" options={{ title: 'Gallery' }} />
          <Stack.Screen name="media-preview" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="stamp-settings" options={{ title: 'Stamp' }} />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

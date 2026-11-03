import { useCameraPermissions } from 'expo-camera';
import { Redirect } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '../components/BrandLogo';
import { colors, glowShadow, radii, spacing } from '../theme';

/** Opens the camera directly when allowed; otherwise explains why access is needed. */
export default function Index() {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return <View style={styles.container} />;
  if (permission.granted) return <Redirect href="/camera" />;

  const blocked = !permission.canAskAgain;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <BrandLogo variant="full" height={260} />
        <Text style={styles.body}>
          GEO-CAM needs the camera to take photos and videos with a location stamp. Everything is
          processed on this device. Nothing is uploaded.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.accentPressed }]}
          onPress={() => (blocked ? Linking.openSettings() : requestPermission())}
        >
          <Text style={styles.buttonText}>{blocked ? 'Open Settings' : 'Allow camera'}</Text>
        </Pressable>
        {blocked ? (
          <Text style={styles.hint}>Camera access was turned off. Enable it in Settings, then return here.</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: {
    backgroundColor: colors.accentStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    ...glowShadow,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.textFaint, fontSize: 13, textAlign: 'center' },
});

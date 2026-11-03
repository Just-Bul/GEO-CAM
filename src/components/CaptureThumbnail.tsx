import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';

import { colors, HIT_TARGET, radii } from '../theme';

export function CaptureThumbnail({
  uri,
  onPress,
  disabled,
}: {
  uri: string | null;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Open gallery"
      style={[styles.box, disabled && { opacity: 0.4 }]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} contentFit="cover" transition={120} />
      ) : (
        <Ionicons name="images-outline" size={24} color={colors.white} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: HIT_TARGET + 8,
    height: HIT_TARGET + 8,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  image: { width: '100%', height: '100%' },
});

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../theme';
import { createStore, useStore } from '../utils/store';

export type ToastKind = 'success' | 'warning' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

const toastStore = createStore<ToastState | null>(null);
let counter = 0;

export function showToast(message: string, kind: ToastKind = 'info') {
  counter += 1;
  toastStore.set({ id: counter, message, kind });
}

const ACCENT: Record<ToastKind, string> = {
  success: colors.success,
  warning: colors.warning,
  error: colors.danger,
  info: colors.accent,
};

export function ToastHost() {
  const toast = useStore(toastStore);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const duration = toast.kind === 'error' || toast.kind === 'warning' ? 5000 : 2200;
    const timer = setTimeout(() => {
      if (toastStore.get()?.id === toast.id) toastStore.set(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 60 }]}>
      <View
        style={[styles.toast, { borderLeftColor: ACCENT[toast.kind] }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text style={styles.text}>{toast.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    backgroundColor: 'rgba(20,21,24,0.94)',
    borderRadius: radii.md,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 520,
  },
  text: { color: colors.text, fontSize: 14, lineHeight: 19 },
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppSettings } from '../../types/settings';
import { createStore, useStore } from '../../utils/store';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settingsDefaults';

const STORAGE_KEY = 'geocam.settings.v1';

export const settingsStore = createStore<AppSettings>(DEFAULT_SETTINGS);
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const settings = sanitizeSettings(raw ? JSON.parse(raw) : null);
    settingsStore.set(settings);
  } catch {
    // Unreadable settings fall back to defaults; the app stays usable.
    settingsStore.set(sanitizeSettings(null));
  }
  loaded = true;
  return settingsStore.get();
}

export function isSettingsLoaded() {
  return loaded;
}

function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settingsStore.get())).catch(() => {
      // Persisting can fail on a full disk; the in-memory settings remain correct for this session.
    });
  }, 250);
}

type SectionKey = Exclude<keyof AppSettings, 'version'>;

export function updateSettings<K extends SectionKey>(section: K, patch: Partial<AppSettings[K]>) {
  settingsStore.set((previous) =>
    sanitizeSettings({ ...previous, [section]: { ...previous[section], ...patch } }),
  );
  persistSoon();
}

export function resetSettings() {
  settingsStore.set(sanitizeSettings(null));
  persistSoon();
}

export function useSettings(): AppSettings {
  return useStore(settingsStore);
}

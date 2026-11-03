import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStore, useStore } from '../../utils/store';
import type { LocationFreshness } from '../location/locationTypes';

/**
 * Local record of what the app captured. The media itself lives in the system
 * library; this keeps the capture details (exact reading, freshness, address)
 * so the gallery can show them without reading EXIF back from shared storage.
 */
export interface CaptureRecord {
  assetId: string;
  kind: 'photo' | 'video';
  fileName: string;
  capturedAt: number;
  width: number;
  height: number;
  durationMs: number | null;
  stamped: boolean;
  /** Why a stamp is missing, when stamping was wanted but did not happen. */
  stampIssue: string | null;
  originalAssetId: string | null;
  videoStampMode: 'fixed' | 'dynamic' | null;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    timestamp: number;
    freshness: LocationFreshness;
    ageMs: number | null;
    mocked: boolean;
  } | null;
  addressTitle: string | null;
  addressLine: string | null;
  utcOffset: string;
  timeZone: string | null;
}

const STORAGE_KEY = 'geocam.captures.v1';
const MAX_RECORDS = 5000;

export const capturesStore = createStore<CaptureRecord[]>([]);
let loaded: Promise<void> | null = null;

export function loadCaptures(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : [];
        capturesStore.set(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => capturesStore.set([]));
  }
  return loaded;
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(capturesStore.get().slice(0, MAX_RECORDS))).catch(
    () => {},
  );
}

export async function addCapture(record: CaptureRecord) {
  await loadCaptures();
  capturesStore.set((previous) =>
    [record, ...previous.filter((r) => r.assetId !== record.assetId)].slice(0, MAX_RECORDS),
  );
  persist();
}

export async function removeCaptures(assetIds: string[]) {
  await loadCaptures();
  const ids = new Set(assetIds);
  capturesStore.set((previous) => previous.filter((r) => !ids.has(r.assetId)));
  persist();
}

/** Drops records whose media no longer exists in the library (deleted in another app). */
export async function pruneCaptures(existingIds: Set<string>) {
  await loadCaptures();
  const before = capturesStore.get();
  const after = before.filter((r) => existingIds.has(r.assetId));
  if (after.length !== before.length) {
    capturesStore.set(after);
    persist();
  }
}

export function findCapture(assetId: string): CaptureRecord | undefined {
  return capturesStore.get().find((r) => r.assetId === assetId);
}

export function useCaptures(): CaptureRecord[] {
  return useStore(capturesStore);
}

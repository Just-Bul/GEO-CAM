import { distanceMeters } from './locationFreshness';
import type { LocationReading } from './locationTypes';

/**
 * Smooths live GPS fixes so the coordinates stop jumping by a few meters every
 * second while the phone is held still, and rejects obvious outliers.
 *
 * It is a one-dimensional Kalman filter per axis (the usual approach for phone
 * GPS): each fix is weighted by the accuracy the OS reports for it, and the
 * estimate is allowed to drift faster when the device is moving. Only fixes the
 * OS actually delivered are used; the filter never extrapolates a position.
 */

/** Assumed drift (m/s) while the device reports no movement. Small = steadier coordinates. */
const STILL_DRIFT_MPS = 0.3;
/** Extra drift allowance on top of the reported speed while moving. */
const MOVING_DRIFT_MPS = 1.5;
/** Reported speed above which the device is considered moving. */
const MOVING_SPEED_MPS = 0.7;
/** Used when the OS does not report an accuracy for a fix. */
const UNKNOWN_ACCURACY_M = 50;
/** A fix implying a speed above this (and well outside both error radii) is treated as a glitch. */
const MAX_PLAUSIBLE_SPEED_MPS = 70;
/** After this long without an accepted fix, start over from the next one instead of rejecting it. */
const REJECT_RESET_MS = 8000;

export interface PositionFilter {
  /** Returns the smoothed reading, or null when the fix was rejected as an outlier. */
  update(reading: LocationReading): LocationReading | null;
  reset(): void;
}

interface State {
  latitude: number;
  longitude: number;
  /** Estimate variance in m². */
  variance: number;
  timestamp: number;
  /** Accuracy of the last accepted fix, as reported by the OS. */
  accuracy: number;
}

export function createPositionFilter(): PositionFilter {
  let state: State | null = null;

  const start = (reading: LocationReading, accuracy: number): LocationReading => {
    state = {
      latitude: reading.latitude,
      longitude: reading.longitude,
      variance: accuracy * accuracy,
      timestamp: reading.timestamp,
      accuracy,
    };
    return reading;
  };

  return {
    reset() {
      state = null;
    },
    update(reading) {
      const accuracy =
        reading.accuracy != null && reading.accuracy > 0 ? reading.accuracy : UNKNOWN_ACCURACY_M;
      if (!state) return start(reading, accuracy);

      const dtMs = reading.timestamp - state.timestamp;
      // Duplicate or out-of-order fix: nothing new to learn from it.
      if (dtMs <= 0) return null;
      if (dtMs > REJECT_RESET_MS * 4) return start(reading, accuracy);

      const dt = dtMs / 1000;
      const distance = distanceMeters(state, reading);
      const estimateError = Math.sqrt(state.variance);

      // Coarse fixes (cell / Wi-Fi) mixed in while a good GPS fix exists cause big jumps.
      const muchWorse = accuracy > Math.max(state.accuracy * 2.5, state.accuracy + 25);
      // Sudden jumps far outside both error radii at an impossible speed are glitches.
      const glitch =
        distance > 3 * (accuracy + estimateError) &&
        distance / dt > Math.max(MAX_PLAUSIBLE_SPEED_MPS, (reading.speed ?? 0) * 2);
      if (muchWorse || glitch) {
        if (dtMs < REJECT_RESET_MS) return null;
        // Nothing usable for a while: the old estimate is stale, follow the device.
        return start(reading, accuracy);
      }

      const moving = reading.speed != null && reading.speed > MOVING_SPEED_MPS;
      const drift = moving ? reading.speed! + MOVING_DRIFT_MPS : STILL_DRIFT_MPS;
      let variance = state.variance + dt * drift * drift;
      // The device moved further than the errors explain (speed not reported, or
      // just started walking): let the estimate catch up instead of lagging behind.
      if (distance > 2 * Math.sqrt(variance + accuracy * accuracy)) {
        variance = Math.max(variance, distance * distance);
      }

      const gain = variance / (variance + accuracy * accuracy);
      state = {
        latitude: state.latitude + gain * (reading.latitude - state.latitude),
        longitude: state.longitude + gain * (reading.longitude - state.longitude),
        variance: (1 - gain) * variance,
        timestamp: reading.timestamp,
        accuracy,
      };
      // Accuracy stays the value the OS reported for this fix, so the stamp
      // never claims to be better than what the device measured.
      return { ...reading, latitude: state.latitude, longitude: state.longitude };
    },
  };
}

import { CameraView, type CameraViewProps } from 'expo-camera';
import { forwardRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

interface Props extends Pick<CameraViewProps, 'facing' | 'flash' | 'enableTorch' | 'mute' | 'videoQuality' | 'pictureSize' | 'onCameraReady' | 'onMountError'> {
  mode: 'picture' | 'video';
  zoom: number;
  onZoomChange: (zoom: number) => void;
  width: number;
  height: number;
  showGrid: boolean;
  active: boolean;
  children?: ReactNode;
}

/**
 * The preview frame is sized to the capture aspect ratio (3:4 photo, 9:16 video),
 * so the frame you see matches the saved media and the stamp overlay lines up.
 */
export const CameraPreview = forwardRef<CameraView, Props>(function CameraPreview(
  { mode, zoom, onZoomChange, width, height, showGrid, active, children, ...cameraProps },
  ref,
) {
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onChange((event) => {
      // expo-camera zoom is a 0–1 fraction of the device's maximum zoom;
      // `scaleChange` is relative to the previous event, so no start value is needed.
      onZoomChange(Math.min(1, Math.max(0, zoom + (event.scaleChange - 1) * 0.6)));
    });

  return (
    <GestureDetector gesture={pinch}>
      <View style={[styles.frame, { width, height }]} collapsable={false}>
        {active ? (
          <CameraView
            ref={ref}
            style={StyleSheet.absoluteFill}
            mode={mode}
            zoom={zoom}
            ratio={Platform.OS === 'android' ? (mode === 'picture' ? '4:3' : '16:9') : undefined}
            animateShutter
            {...cameraProps}
          />
        ) : null}
        {showGrid ? <GridLines /> : null}
        {children}
      </View>
    </GestureDetector>
  );
});

function GridLines() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.lineV, { left: '33.333%' }]} />
      <View style={[styles.lineV, { left: '66.666%' }]} />
      <View style={[styles.lineH, { top: '33.333%' }]} />
      <View style={[styles.lineH, { top: '66.666%' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#000' },
  lineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  lineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
});

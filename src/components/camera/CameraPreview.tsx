import React, {useRef, useState} from 'react';
import {View, StyleSheet, Pressable, Text, ActivityIndicator} from 'react-native';
import {RNCamera} from 'react-native-camera';
import RNFS from 'react-native-fs';

type Props = {
  onCapture: (uri: string) => void;
  onCancel?: () => void;
};

export default function CameraPreview({onCapture, onCancel}: Props) {
  const cameraRef = useRef<any>(null);
  const [isTaking, setIsTaking] = useState(false);

  const takePicture = async () => {
    if (!cameraRef.current || isTaking) return;
    setIsTaking(true);
    try {
      const options = { quality: 0.8, pauseAfterCapture: true, fixOrientation: true } as any;
      const data = await cameraRef.current.takePictureAsync(options);
      if (!data || !data.uri) throw new Error('No image captured');

      const src = data.uri.startsWith('file://') ? data.uri.slice(7) : data.uri;
      const dest = `${RNFS.CachesDirectoryPath}/scan_${Date.now()}.jpg`;
      await RNFS.copyFile(src, dest);
      onCapture(dest);
    } catch (e) {
      console.warn('Camera capture failed', e);
      if (onCancel) onCancel();
    } finally {
      setIsTaking(false);
    }
  };

  return (
    <View style={styles.container}>
      <RNCamera
        ref={cameraRef}
        style={styles.preview}
        type={RNCamera.Constants.Type.back}
        captureAudio={false}
        androidCameraPermissionOptions={{
          title: 'Camera Permission',
          message: 'We need access to your camera to take document photos',
          buttonPositive: 'OK',
          buttonNegative: 'Cancel',
        }}
      />
      <View style={styles.controls}>
        <Pressable style={styles.controlButton} onPress={onCancel}>
          <Text style={styles.controlText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.captureButton} onPress={takePicture} disabled={isTaking}>
          {isTaking ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureText}>●</Text>}
        </Pressable>
        <View style={styles.controlButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  preview: {flex: 1},
  controls: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  controlText: {color: '#fff'},
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e53935',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureText: {color: '#fff', fontSize: 28, lineHeight: 28},
});

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import TabNavigator from './TabNavigator';

// Screens
import ImageToPdfScreen from '../screens/image-to-pdf/ImageToPdfScreen';
import ImageReorderScreen from '../screens/image-to-pdf/ImageReorderScreen';
import PdfViewerScreen from '../screens/pdf-viewer/PdfViewerScreen';
import CompressPdfScreen from '../screens/pdf-compressor/CompressPdfScreen';
import { MergePdfScreen } from '../screens/merge-pdf';
import { OcrScreen } from '../screens/ocr';
import { ScanToSearchablePdfScreen } from '../screens/scan-to-searchable-pdf';
import { SignPdfScreen, SignatureCreateScreen } from '../screens/sign-pdf';
import { SplitPdfScreen } from '../screens/split-pdf';
import { PdfToImageScreen } from '../screens/pdf-to-image';
import { ProtectPdfScreen } from '../screens/protect-pdf';
import { UnlockPdfScreen } from '../screens/pdf-unlock';
import { WordToPdfScreen } from '../screens/word-to-pdf';
import ProScreen from '../screens/pro/ProScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen
        name="ImageToPdf"
        component={ImageToPdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="ImageReorder" component={ImageReorderScreen} />
      <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
      <Stack.Screen name="CompressPdf" component={CompressPdfScreen} />
      <Stack.Screen
        name="MergePdf"
        component={MergePdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="OcrExtract"
        component={OcrScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ScanToSearchablePdf"
        component={ScanToSearchablePdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SignPdf"
        component={SignPdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SignatureCreate"
        component={SignatureCreateScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SplitPdf"
        component={SplitPdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="PdfToImage"
        component={PdfToImageScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ProtectPdf"
        component={ProtectPdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="UnlockPdf"
        component={UnlockPdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="WordToPdf"
        component={WordToPdfScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Pro"
        component={ProScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

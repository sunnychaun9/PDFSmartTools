import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Selected image type used across the app
export type SelectedImage = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
};

// Root Stack (contains TabNavigator + modal/full-screen routes)
export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList>;
  ImageToPdf: { reorderedImages?: SelectedImage[] } | undefined;
  ImageReorder: { images: SelectedImage[] };
  PdfViewer: { filePath: string; title?: string };
  CompressPdf: { filePath?: string };
  MergePdf: undefined;
  OcrExtract: undefined;
  ScanToSearchablePdf: undefined;
  SignPdf: { signatureBase64?: string } | undefined;
  SignatureCreate: { returnTo?: 'SignPdf' } | undefined;
  SplitPdf: undefined;
  PdfToImage: undefined;
  ProtectPdf: undefined;
  UnlockPdf: undefined;
  WordToPdf: undefined;
  Pro: undefined;
  FilePicker: { mode: 'pdf' | 'image'; returnRoute: keyof RootStackParamList };
};

// Bottom Tab Navigator
export type TabParamList = {
  Home: undefined;
  Recent: undefined;
  Settings: undefined;
};

// Screen props types for Root Stack screens
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

// Screen props types for Tab screens
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

// Utility type for useNavigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

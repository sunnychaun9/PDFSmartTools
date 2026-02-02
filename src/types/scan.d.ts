declare module 'react-native' {
  interface NativeModulesStatic {
    ScanPdfModule?: {
      generatePdf: (pagePaths: string[], options: any) => Promise<{ uri: string }>
      processImage: (path: string, polygon: number[] | null, mode: string) => Promise<{ path: string }>
    }
  }
}

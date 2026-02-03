import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { IntentModule } = NativeModules;

export type PdfIntentData = {
  filePath: string;
  fileName: string;
  uri: string;
};

type IntentListener = (data: PdfIntentData) => void;

class IntentService {
  private eventEmitter: NativeEventEmitter | null = null;
  private listeners: IntentListener[] = [];
  private subscription: any = null;

  constructor() {
    if (Platform.OS === 'android' && IntentModule) {
      this.eventEmitter = new NativeEventEmitter(IntentModule);
    }
  }

  async getInitialIntent(): Promise<PdfIntentData | null> {
    if (Platform.OS !== 'android' || !IntentModule) {
      return null;
    }

    try {
      const result = await IntentModule.getInitialIntent();
      return result as PdfIntentData | null;
    } catch (error) {
      console.warn('Failed to get initial intent:', error);
      return null;
    }
  }

  clearIntent(): void {
    if (Platform.OS === 'android' && IntentModule) {
      IntentModule.clearIntent();
    }
  }

  addListener(listener: IntentListener): () => void {
    this.listeners.push(listener);

    // Start listening to native events if this is the first listener
    if (this.listeners.length === 1 && this.eventEmitter) {
      this.subscription = this.eventEmitter.addListener('onPdfIntent', (data: PdfIntentData) => {
        this.listeners.forEach(l => l(data));
      });
    }

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }

      // Stop listening if no more listeners
      if (this.listeners.length === 0 && this.subscription) {
        this.subscription.remove();
        this.subscription = null;
      }
    };
  }
}

export const intentService = new IntentService();

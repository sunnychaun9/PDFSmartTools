import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

const { TextRecognition } = NativeModules;

export type OcrProgress = {
  progress: number;
  status: string;
};

export type TextBlock = {
  text: string;
  confidence: number;
  boundingBox?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  lines: {
    text: string;
    confidence: number;
  }[];
};

export type OcrResult = {
  text: string;
  blocks: TextBlock[];
  blockCount: number;
  averageConfidence: number;
  hasText: boolean;
};

export type OcrOptions = {
  onProgress?: (progress: OcrProgress) => void;
  isPro?: boolean;
};

const eventEmitter = TextRecognition
  ? new NativeEventEmitter(TextRecognition)
  : null;

/**
 * Perform OCR on an image file using ML Kit Text Recognition
 */
export async function recognizeText(
  imagePath: string,
  options: OcrOptions = {}
): Promise<OcrResult> {
  if (Platform.OS !== 'android') {
    throw new Error('Text recognition is only supported on Android');
  }

  if (!TextRecognition) {
    throw new Error('TextRecognition native module is not available');
  }

  const { onProgress, isPro = false } = options;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'TextRecognitionProgress',
        (event: OcrProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await TextRecognition.recognizeText(imagePath, isPro);

    return {
      text: result.text,
      blocks: result.blocks,
      blockCount: result.blockCount,
      averageConfidence: result.averageConfidence,
      hasText: result.hasText,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Copy text to clipboard
 */
export function copyToClipboard(text: string): void {
  Clipboard.setString(text);
}

/**
 * Format confidence percentage for display
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get word count from text
 */
export function getWordCount(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  return text.trim().split(/\s+/).length;
}

/**
 * Get character count from text
 */
export function getCharacterCount(text: string): number {
  return text.length;
}

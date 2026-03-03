import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const RATING_STATE_KEY = '@pdfsmarttools_rating_state';
const ACTION_COUNT_KEY = '@pdfsmarttools_action_count';

// Configuration
const ACTIONS_BEFORE_PROMPT = 3; // Show after 3 successful actions
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pdfsmarttools';

type RatingState = {
  hasRated: boolean;
  hasDismissed: boolean;
  lastPromptDate: string | null;
  promptCount: number;
};

const DEFAULT_RATING_STATE: RatingState = {
  hasRated: false,
  hasDismissed: false,
  lastPromptDate: null,
  promptCount: 0,
};

/**
 * Get the current rating state from storage
 */
async function getRatingState(): Promise<RatingState> {
  try {
    const stored = await AsyncStorage.getItem(RATING_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to get rating state:', error);
  }
  return DEFAULT_RATING_STATE;
}

/**
 * Save rating state to storage
 */
async function saveRatingState(state: RatingState): Promise<void> {
  try {
    await AsyncStorage.setItem(RATING_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save rating state:', error);
  }
}

/**
 * Get the current action count
 */
async function getActionCount(): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(ACTION_COUNT_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch (error) {
    console.warn('Failed to get action count:', error);
    return 0;
  }
}

/**
 * Increment and save the action count
 */
async function incrementActionCount(): Promise<number> {
  try {
    const count = await getActionCount();
    const newCount = count + 1;
    await AsyncStorage.setItem(ACTION_COUNT_KEY, newCount.toString());
    return newCount;
  } catch (error) {
    console.warn('Failed to increment action count:', error);
    return 0;
  }
}

/**
 * Check if we should show the rating prompt
 * Returns true only if:
 * - User hasn't rated
 * - User hasn't permanently dismissed
 * - User has completed enough actions
 * - It's been at least 7 days since last prompt (if dismissed temporarily)
 */
export async function shouldShowRatingPrompt(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const state = await getRatingState();

    // Never show if user has rated
    if (state.hasRated) {
      return false;
    }

    // Never show if user has dismissed permanently
    if (state.hasDismissed) {
      return false;
    }

    // Check action count
    const actionCount = await getActionCount();
    if (actionCount < ACTIONS_BEFORE_PROMPT) {
      return false;
    }

    // If prompted before, wait at least 7 days
    if (state.lastPromptDate) {
      const lastPrompt = new Date(state.lastPromptDate);
      const now = new Date();
      const daysSinceLastPrompt = Math.floor(
        (now.getTime() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceLastPrompt < 7) {
        return false;
      }
    }

    // Limit total prompts to 3
    if (state.promptCount >= 3) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Failed to check rating prompt:', error);
    return false;
  }
}

/**
 * Record that we showed the rating prompt
 */
export async function recordPromptShown(): Promise<void> {
  try {
    const state = await getRatingState();
    state.lastPromptDate = new Date().toISOString();
    state.promptCount += 1;
    await saveRatingState(state);
  } catch (error) {
    console.warn('Failed to record prompt shown:', error);
  }
}

/**
 * Record that user has rated the app
 */
export async function recordRated(): Promise<void> {
  try {
    const state = await getRatingState();
    state.hasRated = true;
    await saveRatingState(state);
  } catch (error) {
    console.warn('Failed to record rated:', error);
  }
}

/**
 * Record that user has dismissed the prompt permanently
 */
export async function recordDismissed(): Promise<void> {
  try {
    const state = await getRatingState();
    state.hasDismissed = true;
    await saveRatingState(state);
  } catch (error) {
    console.warn('Failed to record dismissed:', error);
  }
}

/**
 * Record a successful action and check if we should prompt
 * Call this after successful PDF operations
 */
export async function recordSuccessfulAction(): Promise<boolean> {
  await incrementActionCount();
  return shouldShowRatingPrompt();
}

/**
 * Request in-app review using Google Play In-App Review API
 * Falls back to Play Store listing if not available
 */
export async function requestInAppReview(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    // Dynamically import to avoid crash if not installed
    const InAppReview = require('react-native-in-app-review').default;

    // Check if in-app review is available
    const isAvailable = InAppReview.isAvailable();

    if (isAvailable) {
      // Request the review flow
      const flowResult = await InAppReview.RequestInAppReview();

      // Note: Google doesn't tell us if user actually rated
      // We assume they did if the flow completed
      if (flowResult) {
        await recordRated();
        return true;
      }
    }

    // Fallback to Play Store
    return openPlayStoreListing();
  } catch (error) {
    console.warn('In-app review failed, falling back to Play Store:', error);
    return openPlayStoreListing();
  }
}

/**
 * Open the Play Store listing for the app
 */
export async function openPlayStoreListing(): Promise<boolean> {
  try {
    const canOpen = await Linking.canOpenURL(PLAY_STORE_URL);
    if (canOpen) {
      await Linking.openURL(PLAY_STORE_URL);
      await recordRated();
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Failed to open Play Store:', error);
    return false;
  }
}

/**
 * Reset rating state (for testing purposes)
 */
export async function resetRatingState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RATING_STATE_KEY);
    await AsyncStorage.removeItem(ACTION_COUNT_KEY);
  } catch (error) {
    console.warn('Failed to reset rating state:', error);
  }
}

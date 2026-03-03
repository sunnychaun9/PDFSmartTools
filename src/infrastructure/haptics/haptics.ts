/**
 * Haptic Feedback Utility
 *
 * Provides haptic feedback for key interactions.
 * Silently fails on devices without haptic support.
 */

import ReactNativeHapticFeedback, {
  HapticFeedbackTypes,
} from 'react-native-haptic-feedback';

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

/** Light tap — button press, toggle */
export function hapticLight() {
  try {
    ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.impactLight, options);
  } catch {}
}

/** Medium impact — file picked, action confirmed */
export function hapticMedium() {
  try {
    ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.impactMedium, options);
  } catch {}
}

/** Success notification — operation complete */
export function hapticSuccess() {
  try {
    ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.notificationSuccess, options);
  } catch {}
}

/** Error notification — operation failed */
export function hapticError() {
  try {
    ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.notificationError, options);
  } catch {}
}

/** Warning notification — limit reached, validation */
export function hapticWarning() {
  try {
    ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.notificationWarning, options);
  } catch {}
}

/**
 * Firebase availability guard
 * Returns false when google-services.json is missing (Firebase not configured)
 */

let _available: boolean | null = null;

export function isFirebaseAvailable(): boolean {
  if (_available !== null) return _available;

  try {
    const app = require('@react-native-firebase/app');
    const instance = (app.default || app)();
    // If we can access the app name, Firebase is initialized
    _available = !!instance && typeof instance.name === 'string';
  } catch (_) {
    _available = false;
  }

  return _available;
}

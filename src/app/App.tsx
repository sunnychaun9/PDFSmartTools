import React, { useState, useEffect, useCallback } from 'react';
import AppProviders from './AppProviders';
import { RootNavigator } from '../presentation/navigation';
import OnboardingScreen, {
  isOnboardingComplete,
} from '../presentation/screens/onboarding/OnboardingScreen';
import { initCrashlytics } from '../infrastructure/crashlytics';
import { initAnalytics } from '../infrastructure/analytics';
import { initPerformance } from '../infrastructure/performance';
import { checkDeviceSecurity } from '../infrastructure/security';

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    // Initialize Firebase services (respects privacy settings)
    // Each init function is safe to call without google-services.json
    initCrashlytics().catch(() => {});
    initAnalytics().catch(() => {});
    initPerformance().catch(() => {});
    checkDeviceSecurity().catch(() => {});

    isOnboardingComplete().then((complete) => {
      setShowOnboarding(!complete);
    });
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  // Still loading onboarding state
  if (showOnboarding === null) {
    return null;
  }

  return (
    <AppProviders>
      {showOnboarding ? (
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      ) : (
        <RootNavigator />
      )}
    </AppProviders>
  );
}

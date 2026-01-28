import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  recordSuccessfulAction,
  recordPromptShown,
  recordRated,
  recordDismissed,
  requestInAppReview,
} from '../services/ratingService';

type RatingContextType = {
  /**
   * Call this after a successful PDF action
   * Will automatically check if rating prompt should be shown
   */
  onSuccessfulAction: () => Promise<void>;

  /**
   * Whether the rating modal is currently visible
   */
  showRatingModal: boolean;

  /**
   * Handle user tapping "Rate Now"
   */
  handleRateNow: () => Promise<void>;

  /**
   * Handle user tapping "Maybe Later"
   */
  handleMaybeLater: () => void;

  /**
   * Handle user tapping "Never"
   */
  handleNever: () => Promise<void>;
};

const RatingContext = createContext<RatingContextType | undefined>(undefined);

export function RatingProvider({ children }: { children: ReactNode }) {
  const [showRatingModal, setShowRatingModal] = useState(false);

  const onSuccessfulAction = useCallback(async () => {
    try {
      const shouldShow = await recordSuccessfulAction();
      if (shouldShow) {
        // Small delay to let success modal close first
        setTimeout(() => {
          setShowRatingModal(true);
          recordPromptShown();
        }, 1500);
      }
    } catch (error) {
      console.warn('Failed to check rating prompt:', error);
    }
  }, []);

  const handleRateNow = useCallback(async () => {
    setShowRatingModal(false);
    await requestInAppReview();
  }, []);

  const handleMaybeLater = useCallback(() => {
    setShowRatingModal(false);
    // Don't record anything - will show again after 7 days
  }, []);

  const handleNever = useCallback(async () => {
    setShowRatingModal(false);
    await recordDismissed();
  }, []);

  return (
    <RatingContext.Provider
      value={{
        onSuccessfulAction,
        showRatingModal,
        handleRateNow,
        handleMaybeLater,
        handleNever,
      }}
    >
      {children}
    </RatingContext.Provider>
  );
}

export function useRating(): RatingContextType {
  const context = useContext(RatingContext);
  if (!context) {
    throw new Error('useRating must be used within a RatingProvider');
  }
  return context;
}

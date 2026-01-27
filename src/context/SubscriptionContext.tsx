import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  initializeIAP,
  finalizeIAP,
  setupPurchaseListeners,
  getSubscriptionProducts,
  purchaseSubscription,
  restorePurchases,
  getCachedSubscriptionStatus,
  SUBSCRIPTION_SKUS,
  type SubscriptionProduct,
  type SubscriptionSku,
  type SubscriptionStatus,
} from '../services/subscriptionService';

export type SubscriptionNotification = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
} | null;

type SubscriptionContextType = {
  // Status
  isPro: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Products
  products: SubscriptionProduct[];
  monthlyProduct: SubscriptionProduct | null;
  yearlyProduct: SubscriptionProduct | null;

  // Notification
  notification: SubscriptionNotification;
  clearNotification: () => void;

  // Actions
  purchase: (sku: SubscriptionSku) => Promise<boolean>;
  restore: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export function useSubscription(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

type SubscriptionProviderProps = {
  children: ReactNode;
};

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [notification, setNotification] = useState<SubscriptionNotification>(null);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  // Initialize IAP on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // Load cached status first for instant UI
        const cachedStatus = await getCachedSubscriptionStatus();
        if (mounted) {
          setIsPro(cachedStatus.isPro);
        }

        // Initialize IAP connection
        const connected = await initializeIAP();
        if (!connected || !mounted) {
          setIsLoading(false);
          return;
        }

        // Set up purchase listeners
        setupPurchaseListeners(
          (purchase) => {
            if (mounted) {
              setIsPro(true);
              setNotification({
                type: 'success',
                title: 'Purchase Successful!',
                message: 'Thank you for subscribing to Pro. Enjoy ad-free experience and premium features!',
              });
            }
          },
          (error) => {
            // Check if user cancelled (handle different error formats)
            const code = String(error.code || '');
            const message = String(error.message || '');
            const isCancelled = code.includes('CANCELLED') ||
                               code.includes('CANCELED') ||
                               message.toLowerCase().includes('cancel');

            if (!isCancelled && mounted) {
              setNotification({
                type: 'error',
                title: 'Purchase Failed',
                message: message || 'Something went wrong. Please try again.',
              });
            }
          }
        );

        // Fetch products
        const fetchedProducts = await getSubscriptionProducts();
        if (mounted) {
          setProducts(fetchedProducts);
        }

        // Verify subscription status with Play Store
        const status = await restorePurchases();
        if (mounted) {
          setIsPro(status.isPro);
          setIsInitialized(true);
        }
      } catch (error) {
        console.warn('Subscription initialization error:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      finalizeIAP();
    };
  }, []);

  // Purchase function
  const purchase = useCallback(async (sku: SubscriptionSku): Promise<boolean> => {
    try {
      setIsLoading(true);
      const success = await purchaseSubscription(sku);
      return success;
    } catch (error: any) {
      setNotification({
        type: 'error',
        title: 'Purchase Error',
        message: error.message || 'Failed to complete purchase. Please try again.',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore function
  const restore = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      const status = await restorePurchases();
      setIsPro(status.isPro);

      if (status.isPro) {
        setNotification({
          type: 'success',
          title: 'Restored!',
          message: 'Your Pro subscription has been restored.',
        });
        return true;
      } else {
        setNotification({
          type: 'info',
          title: 'No Subscription Found',
          message: 'No active subscription was found for this account.',
        });
        return false;
      }
    } catch (error) {
      setNotification({
        type: 'error',
        title: 'Restore Failed',
        message: 'Failed to restore purchases. Please try again.',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh function
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const status = await restorePurchases();
      setIsPro(status.isPro);

      const fetchedProducts = await getSubscriptionProducts();
      setProducts(fetchedProducts);
    } catch (error) {
      console.warn('Refresh error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Derived values
  const monthlyProduct = products.find((p) => p.productId === SUBSCRIPTION_SKUS.MONTHLY) || null;
  const yearlyProduct = products.find((p) => p.productId === SUBSCRIPTION_SKUS.YEARLY) || null;

  const value: SubscriptionContextType = {
    isPro,
    isLoading,
    isInitialized,
    products,
    monthlyProduct,
    yearlyProduct,
    notification,
    clearNotification,
    purchase,
    restore,
    refresh,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

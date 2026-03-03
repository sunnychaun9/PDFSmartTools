/**
 * Referral Service
 *
 * Manages referral code generation, sharing, and attribution.
 * - Generates a unique referral code per user (stored locally)
 * - Creates shareable links
 * - Handles incoming referral attribution via deep links
 * - Grants 7-day Pro trial to both referrer and referee
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { createTaggedLogger } from '../../infrastructure/logging/logger';

const log = createTaggedLogger('Referral');

const STORAGE_KEYS = {
  REFERRAL_CODE: '@referral_code',
  REFERRED_BY: '@referred_by',
  REFERRAL_COUNT: '@referral_count',
  REFERRAL_TRIAL_EXPIRY: '@referral_trial_expiry',
};

const REFERRAL_TRIAL_DAYS = 7;
const REFERRAL_LINK_BASE = 'https://pdfsmarttools.com/ref';

/**
 * Generate a unique referral code for this user.
 * Code format: 8-character alphanumeric string.
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusable chars (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get or create the user's referral code.
 */
export async function getReferralCode(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEYS.REFERRAL_CODE);
    if (existing) return existing;

    const code = generateCode();
    await AsyncStorage.setItem(STORAGE_KEYS.REFERRAL_CODE, code);
    log.info(`Generated referral code: ${code}`);
    return code;
  } catch (error) {
    log.warn('Failed to get/create referral code');
    return generateCode(); // Return ephemeral code if storage fails
  }
}

/**
 * Get the shareable referral link
 */
export async function getReferralLink(): Promise<string> {
  const code = await getReferralCode();
  return `${REFERRAL_LINK_BASE}/${code}`;
}

/**
 * Share the referral link via Android share sheet
 */
export async function shareReferralLink(): Promise<boolean> {
  try {
    const link = await getReferralLink();
    const result = await Share.share({
      message: `Try PDF Smart Tools — the best offline PDF editor! Use my link for a free 7-day Pro trial: ${link}`,
      title: 'PDF Smart Tools',
    });
    return result.action === Share.sharedAction;
  } catch (error) {
    log.warn('Failed to share referral link');
    return false;
  }
}

/**
 * Handle an incoming referral (called when app opens via referral deep link).
 * Saves the referrer code and grants a 7-day Pro trial.
 */
export async function handleIncomingReferral(referrerCode: string): Promise<boolean> {
  try {
    // Don't self-refer
    const myCode = await AsyncStorage.getItem(STORAGE_KEYS.REFERRAL_CODE);
    if (myCode === referrerCode) {
      log.info('Self-referral detected, ignoring');
      return false;
    }

    // Don't apply if already referred
    const existingReferrer = await AsyncStorage.getItem(STORAGE_KEYS.REFERRED_BY);
    if (existingReferrer) {
      log.info('Already referred, ignoring duplicate referral');
      return false;
    }

    // Save referrer
    await AsyncStorage.setItem(STORAGE_KEYS.REFERRED_BY, referrerCode);

    // Grant 7-day trial
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + REFERRAL_TRIAL_DAYS);
    await AsyncStorage.setItem(STORAGE_KEYS.REFERRAL_TRIAL_EXPIRY, expiryDate.toISOString());

    log.info(`Referral applied from code: ${referrerCode}, trial expires: ${expiryDate.toISOString()}`);
    return true;
  } catch (error) {
    log.warn('Failed to handle incoming referral');
    return false;
  }
}

/**
 * Check if the user has an active referral trial
 */
export async function hasActiveReferralTrial(): Promise<boolean> {
  try {
    const expiry = await AsyncStorage.getItem(STORAGE_KEYS.REFERRAL_TRIAL_EXPIRY);
    if (!expiry) return false;
    return new Date(expiry).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Get referral trial expiry date (null if no trial)
 */
export async function getReferralTrialExpiry(): Promise<string | null> {
  try {
    const expiry = await AsyncStorage.getItem(STORAGE_KEYS.REFERRAL_TRIAL_EXPIRY);
    if (!expiry) return null;
    if (new Date(expiry).getTime() <= Date.now()) return null;
    return expiry;
  } catch {
    return null;
  }
}

/**
 * Get the count of successful referrals made by this user
 */
export async function getReferralCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.REFERRAL_COUNT);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment referral count (called by server when a referee uses our code)
 * In a full implementation, this would be triggered by a server callback.
 */
export async function incrementReferralCount(): Promise<void> {
  try {
    const count = await getReferralCount();
    await AsyncStorage.setItem(STORAGE_KEYS.REFERRAL_COUNT, String(count + 1));
  } catch {}
}

/**
 * Get referral stats for display in settings/dashboard
 */
export async function getReferralStats(): Promise<{
  code: string;
  referralCount: number;
  referredBy: string | null;
  trialExpiry: string | null;
}> {
  const [code, referralCount, referredBy, trialExpiry] = await Promise.all([
    getReferralCode(),
    getReferralCount(),
    AsyncStorage.getItem(STORAGE_KEYS.REFERRED_BY),
    getReferralTrialExpiry(),
  ]);

  return { code, referralCount, referredBy, trialExpiry };
}

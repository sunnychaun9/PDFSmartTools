# Play Console Configuration Checklist

## Initial Setup

- [ ] Google Play Developer account active and verified
- [ ] Developer name and contact info set
- [ ] Developer email and website configured
- [ ] App created in Play Console with package name `com.pdfsmarttools`

---

## App Signing

### Play App Signing (Recommended)
- [ ] Enroll in Play App Signing
- [ ] Upload your upload key (not your app signing key)
- [ ] Download Play App Signing certificate for assetlinks.json
- [ ] Record both SHA-256 fingerprints:
  - Upload key: `________________`
  - App signing key: `________________`
- [ ] Back up upload keystore securely (offline storage)

### Manual Signing (Alternative)
- [ ] Release keystore created and secured
- [ ] `keystore.properties` configured (NOT in git)
- [ ] Keystore backed up to secure offline location

---

## Store Listing

### Main Listing
- [ ] App title: "PDF Tools - Offline PDF Editor" (30 chars)
- [ ] Short description (80 chars) — see PLAY_STORE_LISTING.md
- [ ] Full description (4000 chars) — see PLAY_STORE_LISTING.md
- [ ] Default language set (English - US)

### Graphics
- [ ] App icon uploaded (512x512 PNG)
- [ ] Feature graphic uploaded (1024x500 PNG/JPEG)
- [ ] Phone screenshots uploaded (min 2, recommended 8)
- [ ] 7-inch tablet screenshots (optional but recommended)
- [ ] 10-inch tablet screenshots (optional)
- [ ] Promotional video URL (optional)

### Categorization
- [ ] Application type: Application
- [ ] Category: Productivity
- [ ] Tags: PDF, Document, Scanner, Converter (select relevant)

---

## Content Rating

- [ ] IARC questionnaire completed
- [ ] Expected rating: Everyone / PEGI 3
- [ ] No content warnings expected
- [ ] Rating certificate saved

---

## Privacy & Compliance

### Privacy Policy
- [ ] Privacy Policy written — see store/PRIVACY_POLICY.md
- [ ] Privacy Policy hosted at https://pdfsmarttools.com/privacy
- [ ] URL added to Play Console

### Data Safety
- [ ] Data safety form completed
- [ ] Data types declared:
  - [ ] Crash logs → collected, shared with Firebase
  - [ ] Analytics → collected, shared with Firebase
  - [ ] Advertising ID → collected, shared with AdMob
  - [ ] Purchase history → collected, shared with Google Play
- [ ] Encryption: Yes (HTTPS for network calls)
- [ ] Deletion mechanism: Clear app data via Settings

### Permissions Declaration
- [ ] CAMERA: "Used for document scanning feature"
- [ ] READ_EXTERNAL_STORAGE: "Used to read PDF and image files selected by user"
- [ ] READ_MEDIA_IMAGES: "Used to read images for Image to PDF conversion"

---

## In-App Products

### Subscriptions
- [ ] Product ID: `pro_monthly` — Monthly Pro subscription
  - [ ] Base plan created
  - [ ] Pricing set (see RELEASE_STRATEGY.md)
  - [ ] Grace period: 7 days
  - [ ] Resubscribe: Enabled
- [ ] Product ID: `pro_yearly` — Yearly Pro subscription
  - [ ] Base plan created
  - [ ] Pricing set (see RELEASE_STRATEGY.md)
  - [ ] Free trial: 7 days
  - [ ] Grace period: 14 days
  - [ ] Resubscribe: Enabled

### Testing
- [ ] License testing accounts added (developer email + test accounts)
- [ ] Test purchases verified on internal track
- [ ] Subscription renewal tested
- [ ] Cancellation flow tested

---

## Ads Declaration

- [ ] App contains ads: Yes
- [ ] Ad SDK: Google AdMob
- [ ] Ad format: Banner ads (bottom of screen)
- [ ] Ads shown only to Free plan users
- [ ] Compliant with AdMob policies

---

## Pre-Registration (Optional)

- [ ] Decide if using pre-registration
- [ ] If yes: Set up pre-registration campaign
- [ ] Pre-registration reward configured (optional)
- [ ] Marketing materials prepared for pre-reg push

---

## Store Listing Experiments (A/B Testing)

After initial launch, set up experiments:

| Experiment | Variants | Metric |
|-----------|----------|--------|
| App Icon | 2-3 icon designs | Install rate |
| Screenshots | Different ordering/headlines | Install rate |
| Short Description | 2 description variants | Install rate |
| Feature Graphic | 2 graphic designs | Browse-to-install |

- [ ] Initial experiment planned (after 1000+ visits for statistical significance)

---

## Publishing Settings

### Timed Publishing
- [ ] Decide on launch timing
- [ ] If timed: Configure publish date in Play Console
- [ ] Coordinate with marketing efforts

### Managed Publishing
- [ ] Enable managed publishing for first release (review before going live)
- [ ] After review approval, manually publish when ready

---

## Post-Setup Verification

- [ ] Internal testing APK/AAB installed and working
- [ ] All store listing previews look correct
- [ ] Store listing accessible via share link
- [ ] Subscription purchase flow works end-to-end
- [ ] Deep links verified (after domain setup)
- [ ] Crashlytics receiving events from release build
- [ ] ProGuard mapping file uploaded to Crashlytics

---

## Launch Day Actions

1. [ ] Final AAB uploaded to production track
2. [ ] Staged rollout set to 10%
3. [ ] Monitor Crashlytics dashboard
4. [ ] Monitor Play Console vitals (ANRs, crashes)
5. [ ] Monitor first reviews
6. [ ] Respond to any user feedback within 24 hours
7. [ ] Increase rollout to 25% after 48 hours if stable
8. [ ] Full rollout after 1 week if metrics are good

---

## Key URLs (To Configure)

| Resource | URL |
|----------|-----|
| Privacy Policy | https://pdfsmarttools.com/privacy |
| Terms of Service | https://pdfsmarttools.com/terms |
| Support Email | support@pdfsmarttools.com |
| Website | https://pdfsmarttools.com |
| Asset Links | https://pdfsmarttools.com/.well-known/assetlinks.json |

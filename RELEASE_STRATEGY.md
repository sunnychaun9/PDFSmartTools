# Release Track & Distribution Strategy

## Release Track Progression

### Track 1: Internal Testing
- **Purpose**: Developer and team testing
- **Testers**: Up to 100 (Google accounts)
- **Review**: No Google review required
- **Timeline**: Ongoing during development
- **Actions**:
  - [ ] Upload signed AAB
  - [ ] Add team email addresses
  - [ ] Verify billing test accounts configured
  - [ ] Test all in-app purchase flows

### Track 2: Closed Testing (Alpha)
- **Purpose**: Real-world feedback from trusted testers
- **Testers**: 50-100 beta testers via email list
- **Review**: Google review required (first time)
- **Timeline**: 2 weeks minimum
- **Entry criteria**:
  - [ ] All Phase 10 quality gates passed
  - [ ] No critical/high severity bugs
  - [ ] ProGuard release build verified
  - [ ] Crashlytics reporting operational
- **Actions**:
  - [ ] Create closed testing track in Play Console
  - [ ] Upload release AAB
  - [ ] Add tester email list
  - [ ] Share opt-in link with testers
  - [ ] Create feedback form (Google Forms)
  - [ ] Monitor Crashlytics for first 48 hours

### Track 3: Open Testing (Beta)
- **Purpose**: Broader audience validation before production
- **Testers**: Public (anyone can join)
- **Review**: Google review required
- **Timeline**: 2-4 weeks
- **Entry criteria**:
  - [ ] Closed testing feedback addressed
  - [ ] Crash-free rate > 99.5%
  - [ ] No 1-star reviews from beta
  - [ ] Performance baselines met (PERFORMANCE_BASELINES.md)
- **Actions**:
  - [ ] Promote from closed to open testing
  - [ ] Monitor reviews and respond to feedback
  - [ ] Fix any new issues discovered
  - [ ] Collect at least 20 reviews

### Track 4: Production
- **Purpose**: Public release
- **Timeline**: After open testing validation
- **Entry criteria**:
  - [ ] Open testing crash-free rate > 99.5%
  - [ ] Average rating >= 4.0 in beta
  - [ ] All feature matrix tests pass (PRE_LAUNCH_TEST_MATRIX.md)
  - [ ] Privacy Policy and Terms of Service URLs live
  - [ ] Store listing assets finalized
- **Actions**:
  - [ ] Staged rollout: 10% → 25% → 50% → 100%
  - [ ] Monitor crash reports at each stage
  - [ ] Halt rollout if crash-free rate drops below 99%
  - [ ] Full rollout after 1 week of stable metrics

---

## Pricing & Distribution

### Subscription Pricing

| Tier | USD | INR | EUR | GBP | BRL |
|------|:---:|:---:|:---:|:---:|:---:|
| Monthly | $4.99 | ₹149 | €4.99 | £3.99 | R$14.90 |
| Yearly | $29.99 | ₹899 | €29.99 | £24.99 | R$89.90 |

**Notes**:
- Use Play Console auto-conversion for unlisted countries
- INR pricing should be aggressive (India is primary market)
- Yearly plan offers ~50% savings to encourage long-term commitment
- Free trial: 7 days for yearly plan

### Market Prioritization

| Priority | Market | Reasoning |
|:--------:|--------|-----------|
| 1 | India | Largest Android market, high PDF tool demand |
| 2 | United States | Highest ARPU, competitive benchmark |
| 3 | Brazil | Large Android market, growing digital economy |
| 4 | Indonesia | High Android adoption, underserved market |
| 5 | Germany / UK | High ARPU, strong privacy awareness |

### Distribution Settings

- **Countries**: All countries (no restrictions)
- **Devices**: All devices meeting minSdkVersion 26 (Android 8.0+)
- **Content Rating**: Complete IARC questionnaire

---

## Content Rating Questionnaire (IARC)

Expected answers for PDF Smart Tools:

| Question | Answer |
|----------|--------|
| Violence | No |
| Sexual content | No |
| Language | No |
| Controlled substances | No |
| User-generated content | No (files are local only) |
| Personal information sharing | No |
| Location sharing | No |
| Ads | Yes (non-targeted, AdMob) |
| In-app purchases | Yes (subscriptions) |
| Gambling | No |

**Expected Rating**: Everyone / PEGI 3 / USK 0

---

## Pre-Launch Checklist

### Play Console Setup
- [ ] Developer account verified and in good standing
- [ ] App signing key enrolled in Play App Signing
- [ ] Store listing complete (all required fields)
- [ ] Content rating questionnaire completed
- [ ] Privacy Policy URL added
- [ ] Target API level meets Play Store requirements (API 34+)

### Technical Requirements
- [ ] Target SDK set to latest (API 34)
- [ ] 64-bit native libraries included (arm64-v8a)
- [ ] Deobfuscation mapping file uploaded (ProGuard)
- [ ] App Bundle (.aab) format used (not APK)
- [ ] Permissions declaration form completed (CAMERA, STORAGE)

### Billing Setup
- [ ] In-app products created (monthly, yearly subscriptions)
- [ ] Base plans configured with pricing
- [ ] License testing accounts added
- [ ] Billing flow tested on internal track

### Compliance
- [ ] Data Safety section completed
- [ ] Ads declaration completed
- [ ] Families Policy compliance (if targeting children — N/A for us)
- [ ] Permissions declaration completed

---

## Data Safety Declaration

For Play Console's Data Safety section:

| Data Type | Collected | Shared | Purpose |
|-----------|:---------:|:------:|---------|
| Crash logs | Yes | Yes (Firebase) | App stability |
| Performance data | Yes | Yes (Firebase) | App performance |
| Device identifiers | Yes | Yes (AdMob) | Advertising |
| Purchase history | Yes | Yes (Google Play) | Subscriptions |
| App interactions | Yes | No | Analytics |
| Files (user PDFs) | No | No | N/A — processed locally |
| Photos/Camera | No | No | N/A — processed locally |
| Personal info | No | No | N/A |

**Encryption**: Yes (data in transit encrypted via HTTPS for analytics/ads)
**Deletion**: Users can clear app data via Android settings

---

## Staged Rollout Plan

| Day | Rollout % | Action |
|:---:|:---------:|--------|
| 1 | 10% | Monitor crash reports, ANRs, reviews |
| 3 | 25% | Review metrics, check for device-specific issues |
| 5 | 50% | Monitor ratings trend, respond to reviews |
| 7 | 100% | Full release if metrics are stable |

### Halt Criteria
- Crash-free rate drops below 99%
- ANR rate exceeds 0.5%
- Multiple 1-star reviews citing same issue
- Revenue anomaly (billing failures)

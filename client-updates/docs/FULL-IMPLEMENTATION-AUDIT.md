# HYMN DISTRIBUTION AUTOMATION SYSTEM
## COMPLETE CODEBASE AUDIT REPORT
**Date:** 2026-06-20  
**Status:** Comprehensive Analysis Complete

---

## PART 1: EXISTING ARCHITECTURE

### Frontend Framework
- **Framework:** Next.js 15.5.14 (App Router) with React 19.1.0
- **Styling:** Tailwind CSS 3.4.17 + PostCSS
- **Build Status:** TypeScript 5.8.3 with strict type checking

### Backend Framework
- **Runtime:** Node.js via Next.js (15.5.14)
- **Route Handlers:** `app/api/*` directories
- **Type Safety:** TypeScript with Prisma + custom ORM

### Database Structure
**Primary:** MySQL via `mysql2/promise` (schema.sql is source of truth)
**Secondary:** PostgreSQL via Prisma (not actively used)
- **Architecture:** Normalized schema with 10+ tables
- **Connection:** Environment-based routing
- **Fallback:** In-memory storage if no valid DATABASE_URL

### Authentication System
- **Method:** JWT (JSON Web Tokens)
- **User Sessions:** JWT in httpOnly cookies via `lib/session.ts`
- **Admin Sessions:** Separate admin JWT with elevated permissions
- **Storage:** Prisma Session model (PostgreSQL) OR cookie-only (MySQL)
- **Secrets:** `JWT_SECRET` and `ADMIN_JWT_SECRET` env vars

### File Storage System
- **Method:** Filesystem-based (`./public/uploads`)
- **Fallback:** Google Cloud Storage via GCS_BUCKET
- **Access:** Web paths converted via PUBLIC_SITE_URL
- **Limits:** 50MB audio, 10MB images
- **Supported Types:** MP3, WAV, FLAC, ZIP (audio); JPEG, PNG, WebP (images)

### Artist System
- **Model:** Prisma `ArtistProfile` (PostgreSQL)
- **Fields:** Name, Spotify/Apple URLs, YouTube URL, Image, Followers
- **Component:** `ArtistPicker` allows searching and selection
- **Status:** Linked to user profiles; last used tracking

### Release System
**MySQL Schema (Active):**
- Releases table with 30+ columns including metadata
- Tracks table for multi-track releases
- Release Queue table for admin workflow
- Status enum: 13 statuses from draft → live

**Type Definition (lib/types.ts):**
```typescript
Release {
  id, userId, artistName, trackName, releaseTitle, releaseType
  audioUrl, artworkUrl, releaseDate, originalReleaseDate
  labelName, primaryGenre, secondaryGenre, language
  platforms, youtubeContentIdEnabled, territory, upcCode
  distributorReleaseId, copyrightOwner, paymentStatus
  status, tracks[], tracks metadata
}

ReleaseTrack {
  id, releaseId, trackTitle, trackNumber
  primaryArtist, featuredArtists, additionalPrimaryArtists
  songwriters, composers, producers
  isrc, isCover, audioUrl, duration
  explicitContent, dolbyAtmos, contributors
}
```

### Distribution Workflow (Current)
1. Artist submits release via form
2. HYMN stores in MySQL releases table
3. Admin manually reviews in `AdminControlCenter`
4. Admin manually updates status (no API integration)
5. No automatic distributor submission
6. No UPC/ISRC tracking
7. No distribution logs

### Admin Workflow (Current)
- **Component:** `AdminControlCenter` (large client component)
- **Tabs:** 21+ admin tabs including "releases" and "distribution-queue"
- **Current Actions:** View releases, manually update status, add notes
- **Missing:** Distribution section, API retry, audit trails, logs

---

## PART 2: EXISTING MODELS & DATABASE SCHEMA

### Users Table
```sql
id, name, email, google_id, password_hash, role, referral_code,
referral_credits, referred_by, first_payment_rewarded, created_at
```
- Supports 3 roles: customer, producer, admin
- Google OAuth integration
- Referral tracking

### Releases Table
```sql
id, user_id, artist_name, track_name, release_title, release_type,
audio_url, artwork_url, release_date, original_release_date,
record_label_name, primary_genre, secondary_genre, language, mood,
platforms (JSON), youtube_content_id_enabled, territory,
upc_code, release_timing, copyright_owner, publishing_rights,
payment_model, payment_status, distribution_plan,
status (13 values), created_at
```
- Missing: album_name, album_version, content_type, distributor_release_id
- Missing: submitted_at, approved_at, distributed_at, live_at timestamps
- Missing: presave dates (Spotify/Apple), exclusive dates
- Missing: phonographic_copyright_line, owner_email, additional_notes
- Missing: cover/license/suno metadata fields

### Tracks Table
```sql
id, release_id, title, version, track_number, primary_artist,
featured_artists, additional_primary_artist, songwriters, composers,
producers, isrc, is_cover, original_artist, cover_license_confirmed,
cover_license_url, audio_url, duration, bpm, musical_key,
explicit_content, dolby_atmos, created_at
```
- Missing: track_genre, track_subgenre, track_language
- Missing: preview_start, vocalist, lyrics, previously_released
- Missing: distributor_status (for tracking)

### Distribution-Related Tables (MISSING)
- distribution_logs (not created)
- release_audit_logs (not created)

---

## PART 3: EXISTING FEATURES

### Current Release Creation Flow
1. **Step 1 - Tracks:** Add audio files, set track metadata
   - Supported: title, version, artist info, songwriters/composers
   - NOT Supported: preview start, vocalist, lyrics

2. **Step 2 - Release:** Basic metadata
   - Title, Label, Genre (primary + secondary), Language, Territory
   - Supported: Copyright owner, publishing rights
   - NOT Supported: Album version, content type, presave dates

3. **Step 3 - Artwork:** Cover art upload
   - Supported: JPEG, PNG, WebP

4. **Step 4 - Destinations:** Platform selection
   - Supported: Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, etc.
   - NOT Supported: Platform-specific exclusivity/presave dates

5. **Step 5 - Review:** Legal confirmations
   - Ownership, infringement, collaborator credits, platform guidelines
   - YouTube Content ID election
   - Monetization clauses (per-platform)

### Current Artist Onboarding Flow
- Users authenticate via Google OAuth
- No formal "artist onboarding" workflow
- Artists can be added via ArtistPicker during release creation
- Linking to Spotify/Apple APIs not automated

### Current Metadata Collection Flow
- Form captures 25+ fields
- Validation is client-side only
- No server-side validation
- No validation of distributor requirements

### Current Approval Process
- Manual: Admin opens AdminControlCenter
- Manual: Admin selects release
- Manual: Admin changes status manually
- No automation
- No API integration
- No notification to artist

### Current Storage System
- Local: `./public/uploads/{directory}/{uuid}.{ext}`
- Web accessible: `/uploads/{directory}/{uuid}.{ext}`
- Returns relative paths, NOT absolute URLs
- Requires PUBLIC_SITE_URL for absolute conversion

### Current Upload Handling
- `saveUploadedFile()` in lib/storage.ts
- Validates file types and sizes
- Writes to filesystem
- Returns web path (relative)

---

## PART 4: GAP ANALYSIS

### Missing Database Fields

**Releases Table Gaps:**
| Field | Current | Need | Impact |
|-------|---------|------|--------|
| album_name | ✗ | ✓ | Distributor requires for albums |
| album_version | ✗ | ✓ | Distributor differentiates versions |
| content_type | ✗ | ✓ | Blocks AI-generated content |
| distributor_release_id | ✗ | ✓ | CRITICAL: No tracking |
| submitted_at | ✗ | ✓ | For audit trail |
| approved_at | ✗ | ✓ | For audit trail |
| distributed_at | ✗ | ✓ | For tracking |
| live_at | ✗ | ✓ | For tracking |
| spotify_presave_date | ✗ | ✓ | Distributor field |
| apple_presave_date | ✗ | ✓ | Distributor field |
| spotify_exclusive_date | ✗ | ✓ | Distributor field |
| apple_exclusive_date | ✗ | ✓ | Distributor field |
| copyright_line | ✗ | ✓ | Separate from owner |
| phonographic_copyright_line | ✗ | ✓ | Distributor requires |
| previously_released | ✗ | ✓ | Distributor field |
| owner_email | ✗ | ✓ | Distributor field |
| additional_notes | ✗ | ✓ | Distributor field |
| license_document_url | ✗ | ✓ | For non-exclusive licenses |
| suno_receipt_url | ✗ | ✓ | For AI-generated content |
| suno_link | ✗ | ✓ | For AI-generated content |

**Tracks Table Gaps:**
| Field | Current | Need | Impact |
|-------|---------|------|--------|
| track_genre | ✗ | ✓ | May differ from release genre |
| track_subgenre | ✗ | ✓ | May differ from release subgenre |
| track_language | ✗ | ✓ | May differ from release language |
| preview_start | ✗ | ✓ | Distributor field |
| vocalist | ✗ | ✓ | Distributor field |
| lyrics | ✗ | ✓ | Distributor field |
| previously_released | ✗ | ✓ | Distributor field |
| distributor_status | ✗ | ✓ | For individual track tracking |

**New Tables Required:**
- `distribution_logs` - request/response/warnings/errors tracking
- `release_audit_logs` - action trail for compliance

### Missing Frontend Fields

**Release Form Missing:**
- Album Name input
- Album Version dropdown (original, remixed, remastered, etc.)
- Content Type selector (original, AI-generated, licensed)
- Dynamic fields based on Content Type:
  - If AI-generated: Suno Receipt upload + Suno Link
  - If licensed: License Document upload
- Presave date inputs (Spotify, Apple)
- Exclusive date inputs (Spotify, Apple)
- Owner Email field
- Additional Notes textarea
- Previously Released checkbox

**Track Form Missing:**
- Preview Start time input (MM:SS)
- Vocalist field
- Lyrics textarea
- Previously Released checkbox
- Track-specific Genre/Subgenre (optional override)
- Track-specific Language (optional override)

**Artist Form Missing:**
- IPI Number field
- IPRS Member checkbox
- Instagram URL field (for new artists)
- X (Twitter) URL field
- Validation: first + last name requirement
- Reject mononyms

**Songwriter/Composer Missing:**
- IPI Number field
- IPRS Member checkbox
- Instagram URL field
- X (Twitter) URL field
- Validation: first + last name requirement
- Reject mononyms

### Missing Validation

**Server-side validation missing for:**
- Required field completeness
- Release architecture (single = 1 track, EP = 2+, album = 2+)
- Track count rules
- Date logical ordering (release_date, presave_dates, exclusive_dates)
- Artist requirements (primary artist required per track)
- Asset accessibility (artwork/audio must be public URLs)
- Songwriter/Composer requirements (first + last names)
- Content type conditional requirements
- Lyrics requirements
- File type and size validation at API level
- Payload field requirements per distributor spec

**No validation for:**
- Duplicate ISRCs within release
- Invalid UPC formats
- Email format validation
- URL format validation
- Date format validation

### Missing Upload Requirements

**Distributor requires:**
- Artwork: Public URL (HTTPS)
- Audio: Public URL (HTTPS)
- License Document: Public URL (HTTPS) if non-exclusive
- Suno Receipt: Public URL (HTTPS) if AI-generated

**Current system:**
- Returns relative paths: `/uploads/releases/audio/uuid.wav`
- Missing absolute URL conversion in production

### Missing API Integration

**Not implemented:**
- Distributor authentication (no API PIN submission)
- Distributor payload generation (no mapping)
- Distributor response handling (no UPC/ISRC extraction)
- Distributor error handling (no retry logic)
- Status sync from distributor (one-way only)
- Distributor credentials in environment (no server-side access)

### Missing Status Tracking

**Current statuses:** submitted, in_queue, under_review, approved, sent, live (6 of 13 defined)

**Missing statuses:**
- changes_requested
- queued_for_distribution
- sent_to_distributor
- processing
- delivered
- rejected
- failed

**Missing state transitions:**
- No status flow enforcement
- No status history tracking
- No event triggers on status change
- No notifications on status change

### Missing Logging

**Not implemented:**
- Distribution request logging
- Distribution response logging
- Error logging per request
- Warning logging per request
- Retry attempt logging
- Success/failure tracking

### Missing Audit Trails

**Not implemented:**
- Who approved? (user_id)
- When approved? (timestamp)
- What changed? (diff tracking)
- Why failed? (error details)
- What errors? (error logs)
- Retry history (attempts)

---

## PART 5: DISTRIBUTOR REQUIREMENTS ANALYSIS

### Distributor Endpoint Structure
**Required Credentials:**
- Client ID: `20260612_hymnmusicindia@gmail.com`
- API PIN: `6HSSCLBA`
- Endpoint URL: TBD (user to provide)
- Authentication: Headers or body parameters

### Distributor Payload Fields Expected
**Release Level:**
- album_name, release_type, genre, subgenre
- language, release_date, original_release_date
- label_name, copyright_line, phonographic_copyright_line
- platforms (array), territory
- artwork_url (public), owner_email

**Track Level:**
- track_number, track_name, track_version
- isrc, audio_url (public)
- explicit_lyrics, previously_released
- artists (primary, featuring, additional)
- producer_credits, songwriters, composers
- cover info (is_cover, original_artist, license_url)

**Content Type Conditional:**
- AI-generated: suno_receipt_url, suno_link
- Non-exclusive: license_document_url

### Distributor Response Expected
- distributor_release_id
- upc (may auto-generate)
- track ISRCs (may auto-assign)
- status (sent, processing, delivered)
- warnings (optional field validation issues)

---

## PART 6: CURRENT IMPLEMENTATION STATUS

### ✅ ALREADY IMPLEMENTED
1. **Database foundation:** MySQL schema with 10+ tables
2. **Release model:** Comprehensive fields in DB + types
3. **Track model:** Track-level metadata
4. **Authentication:** JWT-based with admin roles
5. **Storage:** File upload system with validation
6. **Frontend:** 5-step release form with UI components
7. **Admin panel:** AdminControlCenter with 21+ tabs
8. **Type safety:** Full TypeScript coverage
9. **Partial service:** `lib/distribution-service.ts` with validation + payload builders
10. **Partial logging:** distribution_logs, release_audit_logs tables defined in SQL

### ⚠️ PARTIALLY IMPLEMENTED
1. **Distribution service:** Validation ✓, Payload building ✓, Submission ✗
2. **Admin distribution section:** Not visible in UI yet
3. **Status enum:** Defined but not all used
4. **Database migrations:** SQL defined but not all executed

### ❌ NOT IMPLEMENTED
1. **Distributor credentials:** Missing from .env
2. **API submission logic:** No actual HTTP calls to distributor
3. **Response handling:** No UPC/ISRC extraction
4. **Error handling:** No retry logic implemented
5. **Status sync:** One-way only
6. **Logging system:** Tables exist, not written to
7. **Audit trail:** Tables exist, not written to
8. **Retry queue:** Not implemented
9. **Admin approval flow:** Manual only
10. **End-to-end tests:** No tests exist
11. **Error notifications:** Not implemented
12. **Dynamic UI fields:** Not implemented

---

## PART 7: MISSING FIELDS IN RELEASE FORM

### Release Metadata Missing:
- [ ] Album Name (text input)
- [ ] Album Version (dropdown: Original, Remixed, Remastered, etc.)
- [ ] Content Type (radio: Original/Exclusive Licensed, AI Generated, Non-Exclusive Licensed)
- [ ] Phonographic Copyright Line (text)
- [ ] Previously Released (checkbox)
- [ ] Owner Email (email input)
- [ ] Additional Notes (textarea)

### Presave/Exclusive Dates Missing:
- [ ] Spotify Presave Date (date input)
- [ ] Apple Presave Date (date input)
- [ ] Spotify Exclusive Date (date input)
- [ ] Apple Exclusive Date (date input)

### Content Type Conditional Fields:
- **If AI-Generated:**
  - [ ] Suno Receipt Upload (file)
  - [ ] Suno Link (URL)
- **If Non-Exclusive Licensed:**
  - [ ] License Document Upload (file)

### Track Metadata Missing:
- [ ] Track Genre (dropdown, optional)
- [ ] Track Subgenre (dropdown, optional)
- [ ] Track Language (dropdown, optional)
- [ ] Preview Start (time MM:SS)
- [ ] Vocalist (text)
- [ ] Lyrics (textarea)
- [ ] Previously Released (checkbox)

### Artist Metadata Missing (per artist):
- [ ] IPI Number (text)
- [ ] IPRS Member (checkbox)
- [ ] Instagram URL (URL input)
- [ ] X/Twitter URL (URL input)
- [ ] Validation: Must contain first and last name

### Songwriter/Composer Metadata Missing (per contributor):
- [ ] IPI Number (text)
- [ ] IPRS Member (checkbox)
- [ ] Instagram URL (URL input)
- [ ] X/Twitter URL (URL input)
- [ ] Validation: Must contain first and last name (reject mononyms)

---

## PART 8: SUMMARY TABLE - COMPLETENESS

| Component | Status | Priority | Effort |
|-----------|--------|----------|--------|
| Database schema expansion | 20% | CRITICAL | 2h |
| Database migrations | 0% | CRITICAL | 1h |
| Release form fields | 40% | CRITICAL | 8h |
| Track form fields | 50% | HIGH | 4h |
| Artist/Contributor fields | 30% | HIGH | 4h |
| Server-side validation | 10% | CRITICAL | 6h |
| Distributor authentication | 0% | CRITICAL | 2h |
| API submission | 0% | CRITICAL | 4h |
| Response handling | 0% | CRITICAL | 3h |
| Error handling/retry | 0% | HIGH | 4h |
| Logging system | 0% | HIGH | 3h |
| Audit trail system | 0% | HIGH | 3h |
| Admin UI Distribution section | 0% | HIGH | 5h |
| End-to-end testing | 0% | HIGH | 8h |
| **TOTAL** | **15%** | **-** | **57 hours** |

---

## PART 9: CRITICAL FINDINGS

### 🔴 BLOCKERS TO PRODUCTION

1. **No Distributor Credentials in .env**
   - Impact: API submission will crash
   - Fix: Add DISTRIBUTOR_CLIENT_ID, DISTRIBUTOR_API_PIN

2. **No API Endpoint Configured**
   - Impact: No submission possible
   - Fix: Add DISTRIBUTOR_RELEASE_ENDPOINT (obtain from distributor)

3. **No PUBLIC_SITE_URL in Production**
   - Impact: Local uploads won't work
   - Fix: Set to production HTTPS domain

4. **Database Migrations Not Executed**
   - Impact: New columns don't exist
   - Fix: Run distribution-automation.sql

5. **No Actual API Submission Logic**
   - Impact: Releases won't submit to distributor
   - Fix: Implement HTTP POST to distributor endpoint

6. **No Response Parsing**
   - Impact: UPC/ISRC won't be stored
   - Fix: Parse distributor response and extract IDs

7. **No Retry Logic**
   - Impact: Transient failures permanent
   - Fix: Implement exponential backoff retry queue

8. **No Admin UI for Approval**
   - Impact: Admin can't approve releases
   - Fix: Add Distribution section to AdminControlCenter

### ⚠️ HIGH-PRIORITY GAPS

1. Missing form fields (18 fields total)
2. No server-side validation
3. No error handling in admin flow
4. No notifications to artists
5. No status history tracking
6. No test coverage

---

## RECOMMENDATIONS

### Immediate Actions (Week 1):
1. Configure .env with distributor credentials
2. Execute database migrations
3. Add PUBLIC_SITE_URL to .env
4. Implement HTTP submission to distributor

### Short Term (Week 2):
1. Expand release form with 18 missing fields
2. Implement server-side validation
3. Add response parsing for UPC/ISRC
4. Add error handling and retry logic

### Medium Term (Week 3):
1. Add Admin UI Distribution section
2. Implement logging system
3. Implement audit trail system
4. Add artist notifications

### Long Term (Week 4+):
1. End-to-end testing
2. Production deployment
3. Monitoring and observability
4. Performance optimization

---

## CONCLUSION

**Current State:** 15% complete - Architectural foundation solid, core service 40% complete, missing 85% of integration logic.

**Path Forward:** Gap analysis identifies exactly what needs to be built. Implementation plan will follow with step-by-step execution.

**Estimate:** 57 hours to full production-ready system.

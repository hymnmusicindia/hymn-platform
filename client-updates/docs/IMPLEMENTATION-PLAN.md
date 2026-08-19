# HYMN DISTRIBUTION AUTOMATION SYSTEM
## COMPLETE IMPLEMENTATION PLAN
**Prepared:** 2026-06-20  
**Distributor Credentials:** Ready (will be configured)  
**Target Completion:** 4 weeks

---

## EXECUTION STRATEGY

### Phase 1: Infrastructure & Configuration (Week 1)
- Configure distributor credentials in .env.local
- Execute all database migrations
- Extend database schema in Prisma

### Phase 2: Data Model & Validation (Week 1-2)
- Extend Release and Track types
- Implement comprehensive server-side validation
- Create validation error handling

### Phase 3: Frontend Enhancement (Week 2)
- Add 18 missing form fields
- Implement dynamic field visibility
- Add client-side validation

### Phase 4: API Integration (Week 2-3)
- Implement distributor HTTP client
- Build payload submission
- Implement response handling
- Add error handling & retry logic

### Phase 5: Admin UI & Workflows (Week 3)
- Add Distribution section to AdminControlCenter
- Implement approval flow
- Add distribution logs view
- Add audit trail view

### Phase 6: Testing & Polish (Week 4)
- Create test suite
- End-to-end testing
- Production readiness verification

---

## PHASE 1: INFRASTRUCTURE & CONFIGURATION

### 1.1 Create/Update `.env.local`

**File:** `d:\HYMN WEBSITE AI\HYMN website\.env.local`

```env
# Existing vars (keep as is)
NEXT_PUBLIC_APP_URL=http://localhost:3000
PUBLIC_SITE_URL=http://localhost:3000
JWT_SECRET=<existing-value>
DATABASE_URL=<existing-mysql-url>

# NEW: Distributor Configuration
DISTRIBUTOR_CLIENT_ID=20260612_hymnmusicindia@gmail.com
DISTRIBUTOR_API_PIN=6HSSCLBA
DISTRIBUTOR_RELEASE_ENDPOINT=<to-be-provided-by-distributor>
DISTRIBUTOR_STATUS_ENDPOINT=<to-be-provided-by-distributor>
```

**For Production (.env.production):**
```env
PUBLIC_SITE_URL=https://hymn.example.com
DISTRIBUTOR_RELEASE_ENDPOINT=<production-endpoint>
DISTRIBUTOR_STATUS_ENDPOINT=<production-endpoint>
```

### 1.2 Database Migrations

**File to Execute:** `db/distribution-automation.sql`

Execute against active MySQL database:
```bash
mysql -u <user> -p <password> <database> < db/distribution-automation.sql
```

Changes:
- Adds 20 new columns to `releases` table
- Adds 9 new columns to `tracks` table
- Creates `distribution_logs` table
- Creates `release_audit_logs` table

### 1.3 Update Prisma Schema

**File:** `prisma/schema.prisma`

After migration, regenerate Prisma client:
```bash
npm run db:generate
```

Add new enums and fields:
- Add ContentType enum (original_exclusive_licensed, ai_generated, non_exclusive_licensed)
- Extend Release model with distributor fields
- Extend ReleaseTrack model with distributor fields

---

## PHASE 2: DATA MODEL & VALIDATION

### 2.1 Extend TypeScript Types

**File:** `lib/types.ts`

**Changes:**
1. Add ContentType type union
2. Extend Release interface with 15+ new fields
3. Extend ReleaseTrack interface with 8+ new fields
4. Create new DistributionValidationIssue type
5. Create new DistributorPayload types
6. Add DistributionLog and ReleaseAuditLog types

**Lines to modify:**
- Lines 1-20: Add ContentType enum
- Lines 80-150: Extend Release interface
- Lines 150-200: Extend ReleaseTrack interface
- Lines 200-250: Add validation types

### 2.2 Implement Server-Side Validation

**File:** `lib/distribution-validation.ts` (NEW)

Create comprehensive validation engine:

```typescript
export type ValidationIssue = {
  field: string;
  message: string;
  severity: 'error' | 'warning';
};

export function validateRelease(release: Release): {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateTrack(track: ReleaseTrack, releaseType: string): {
  valid: boolean;
  errors: ValidationIssue[];
}

export function validateArtist(artist: ArtistInfo): {
  valid: boolean;
  errors: ValidationIssue[];
}

export function validateSongwriter(songwriter: ContributorCredit): {
  valid: boolean;
  errors: ValidationIssue[];
}
```

**Validation Rules:**

Release Level:
- [ ] releaseTitle: required, max 190 chars
- [ ] artistName: required
- [ ] releaseType: must be single/ep/album
- [ ] primaryGenre: required
- [ ] secondaryGenre: required
- [ ] language: required
- [ ] releaseDate: required, valid ISO date
- [ ] labelName: required
- [ ] copyrightOwner: required
- [ ] artworkUrl: required, must be public HTTPS URL
- [ ] contentType: if "ai_generated", require suno fields
- [ ] contentType: if "non_exclusive", require license doc
- [ ] previouslyReleased: if true, originalReleaseDate must be earlier
- [ ] presaveDates: must be after releaseDate if provided
- [ ] exclusiveDates: must be after releaseDate if provided
- [ ] platforms: at least one selected
- [ ] ownerEmail: valid email format if provided

Track Level (per track):
- [ ] trackTitle: required
- [ ] primaryArtist: required
- [ ] audioUrl: required, must be public HTTPS URL
- [ ] duration: required, valid time format
- [ ] songwriters: if empty, add warning
- [ ] composers: if empty, add warning
- [ ] producers: if empty, add warning
- [ ] isCover: if true, require coverLicenseConfirmed
- [ ] isCover: if true, require coverLicenseUrl (public HTTPS)
- [ ] songwriters/composers: each must have first + last name
- [ ] explicit_lyrics: if true, explicitly confirm
- [ ] isrc: if provided, valid format

Release Architecture:
- [ ] Single: exactly 1 track
- [ ] EP: 2-4 tracks
- [ ] Album: 5+ tracks recommended, minimum 2
- [ ] Minimum track count enforced

Public URL Validation:
- [ ] artworkUrl: http:// or https://, must be accessible
- [ ] audioUrl: http:// or https://, must be accessible
- [ ] coverLicenseUrl: http:// or https:// if provided
- [ ] sunoReceiptUrl: http:// or https:// if AI-generated
- [ ] licenseDocumentUrl: http:// or https:// if licensed

Artist Validation:
- [ ] name: required, max 190 chars
- [ ] If new artist, name must have first + last (reject mononyms)
- [ ] If Spotify URL provided, must be valid format
- [ ] If Instagram URL provided and artist new, make required

Songwriter/Composer Validation:
- [ ] Full name: required, must have first + last name
- [ ] IPI: optional but validated if provided
- [ ] Instagram/X URLs: optional but validated if provided

### 2.3 Create Distributor Payload Builder

**File:** `lib/distribution-payload.ts` (NEW)

```typescript
export function buildDistributorPayload(
  release: Release,
  tracks: ReleaseTrack[],
  artists: Map<number, ArtistProfile>,
  options?: { siteUrl?: string }
): DistributorPayload

export function convertLocalUrlToPublic(
  localPath: string | undefined,
  siteUrl?: string
): string | undefined

export function formatContributors(
  csvString: string
): { full_name: string; ipi?: string; instagram?: string; x?: string }[]
```

Payload structure:
```typescript
{
  client_id: string;
  release: {
    album_name: string;
    release_type: 'single' | 'ep' | 'album';
    genre: string;
    subgenre: string;
    language: string;
    release_date: string;
    original_release_date?: string;
    label_name: string;
    copyright_line: string;
    phonographic_copyright_line: string;
    upc?: string;
    artwork_url: string;
    owner_email?: string;
    platforms: string[];
    territory: string;
    previously_released: boolean;
    content_type: 'original' | 'ai_generated' | 'licensed';
    // ... additional fields
  };
  tracks: [
    {
      track_number: number;
      track_name: string;
      track_version?: string;
      isrc?: string;
      audio_url: string;
      genre: string;
      language: string;
      explicit_lyrics: boolean;
      previously_released: boolean;
      artists: {
        primary: string[];
        featuring: string[];
        additional: string[];
      };
      producer_credits: string[];
      songwriters: { full_name: string; ipi?: string }[];
      composers: { full_name: string; ipi?: string }[];
      cover?: {
        is_cover: boolean;
        original_artist?: string;
        original_track_link?: string;
        license_url?: string;
      };
      // ... additional fields
    }
  ];
}
```

---

## PHASE 3: FRONTEND ENHANCEMENT

### 3.1 Extend Release Form Component

**File:** `components/release-form.tsx`

**Changes:**

1. **Release Metadata Section Expansion**

Add new fields to ReleaseDraft type:
```typescript
type ReleaseDraft = {
  // ... existing fields ...
  
  // NEW FIELDS
  albumName: string;
  albumVersion: string;
  contentType: 'original_exclusive' | 'ai_generated' | 'non_exclusive' | '';
  phonographicCopyrightLine: string;
  previouslyReleased: boolean;
  ownerEmail: string;
  additionalNotes: string;
  spotifyPresaveDate: string;
  applePresaveDate: string;
  spotifyExclusiveDate: string;
  appleExclusiveDate: string;
  
  // For AI-generated content
  sunoReceiptFile: File | null;
  sunoReceiptUrl: string;
  sunoLink: string;
  
  // For licensed content
  licenseDocumentFile: File | null;
  licenseDocumentUrl: string;
}
```

2. **Track Metadata Expansion**

Add to TrackDraft type:
```typescript
type TrackDraft = {
  // ... existing fields ...
  
  // NEW FIELDS
  trackGenre: string;
  trackSubgenre: string;
  trackLanguage: string;
  previewStart: string; // MM:SS format
  vocalist: string;
  lyrics: string;
  previouslyReleased: boolean;
}
```

3. **Artist Metadata Expansion**

For artists in track, add:
```typescript
type ArtistExtension = {
  ipiNumber?: string;
  iprsEnabled?: boolean;
  instagramUrl?: string;
  xUrl?: string;
}
```

4. **Contributor Expansion**

For songwriters/composers, add:
```typescript
type ContributorExtension = {
  ipiNumber?: string;
  iprsEnabled?: boolean;
  instagramUrl?: string;
  xUrl?: string;
}
```

5. **Form UI Updates**

In Step 2 (Release), add new fields:
- [ ] Album Name (text input)
- [ ] Album Version (dropdown)
- [ ] Content Type (radio buttons)
- [ ] Conditional fields based on Content Type
- [ ] Phonographic Copyright Line (text)
- [ ] Previously Released (checkbox)
- [ ] Owner Email (email)
- [ ] Presave dates (date inputs)
- [ ] Exclusive dates (date inputs)
- [ ] Additional Notes (textarea)

In Step 1 (Tracks), add new fields per track:
- [ ] Track Genre (optional dropdown)
- [ ] Track Subgenre (optional dropdown)
- [ ] Track Language (optional dropdown)
- [ ] Preview Start (time input)
- [ ] Vocalist (text)
- [ ] Lyrics (textarea)
- [ ] Previously Released (checkbox)

For contributors, add new fields:
- [ ] IPI Number (text)
- [ ] IPRS Member (checkbox)
- [ ] Instagram URL (URL)
- [ ] X URL (URL)

Add validation:
- First + last name requirement
- Reject mononyms
- Email format for owner email
- Date format validation
- Time format validation for preview start

### 3.2 Create Component: ContentTypeSelector

**File:** `components/content-type-selector.tsx` (NEW)

Dynamic visibility component:
- Shows Suno fields if AI-generated
- Shows License fields if non-exclusive
- Shows nothing for original

### 3.3 Create Component: PresaveDateSelector

**File:** `components/presave-date-selector.tsx` (NEW)

Multi-platform presave date selector:
- Spotify presave date
- Apple presave date
- Spotify exclusive date
- Apple exclusive date
- Validation: must be after release date

### 3.4 Create Component: ContributorExtendedForm

**File:** `components/contributor-extended-form.tsx` (NEW)

Extends existing ContributorsModal with:
- IPI Number field
- IPRS checkbox
- Instagram URL
- X URL
- Validation: first + last name

---

## PHASE 4: API INTEGRATION

### 4.1 Create Distributor HTTP Client

**File:** `lib/distributor-client.ts` (NEW)

```typescript
export type DistributorResponse = {
  raw: unknown;
  distributorReleaseId?: string;
  upc?: string;
  trackIsrcs?: Record<number, string>;
  warnings: string[];
  status: 'sent_to_distributor' | 'processing' | 'delivered';
};

export async function submitToDistributor(
  payload: DistributorPayload,
  options?: { timeout?: number; retryCount?: number }
): Promise<DistributorResponse>

export async function getDistributionStatus(
  distributorReleaseId: string
): Promise<{ status: string; details?: Record<string, unknown> }>

function parseDistributorResponse(data: unknown): DistributorResponse
```

Implementation:
```typescript
export async function submitToDistributor(
  payload: DistributorPayload,
  options = {}
): Promise<DistributorResponse> {
  const endpoint = process.env.DISTRIBUTOR_RELEASE_ENDPOINT;
  const apiPin = process.env.DISTRIBUTOR_API_PIN;
  
  if (!endpoint) throw new Error('DISTRIBUTOR_RELEASE_ENDPOINT not configured');
  if (!apiPin) throw new Error('DISTRIBUTOR_API_PIN not configured');
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-ID': payload.client_id,
      'X-API-PIN': apiPin,
    },
    body: JSON.stringify(payload),
    timeout: options.timeout || 30000,
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new DistributorApiError(
      `Distributor returned ${response.status}`,
      response.status,
      data
    );
  }
  
  return parseDistributorResponse(data);
}
```

### 4.2 Implement Response Parsing

**Within:** `lib/distributor-client.ts`

```typescript
function parseDistributorResponse(data: unknown): DistributorResponse {
  const record = (data ?? {}) as Record<string, any>;
  
  return {
    raw: data,
    distributorReleaseId: 
      record.release_id || 
      record.distributor_release_id || 
      record.id,
    upc: 
      record.upc || 
      record.upc_code || 
      record.release?.upc,
    trackIsrcs: parseTrackIsrcs(record.tracks),
    warnings: record.warnings || [],
    status: determineStatus(record.status || record.release?.status),
  };
}

function parseTrackIsrcs(tracks?: Array<any>): Record<number, string> {
  if (!Array.isArray(tracks)) return {};
  
  return Object.fromEntries(
    tracks
      .map((t) => [Number(t.track_number), t.isrc])
      .filter(([_, isrc]) => isrc)
  );
}
```

### 4.3 Implement Error Handling & Retry

**File:** `lib/distributor-retry.ts` (NEW)

```typescript
export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableStatusCodes: number[];
};

export async function submitWithRetry(
  releaseId: number,
  payload: DistributorPayload,
  policy?: Partial<RetryPolicy>
): Promise<DistributorResponse>

const defaultPolicy: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};
```

Retry logic:
- Exponential backoff: 1s, 2s, 4s
- Retryable: 5xx errors, timeouts, network errors
- Non-retryable: 4xx validation errors (except 408, 429)
- Max 3 attempts per submission

### 4.4 Update Distribution Service

**File:** `lib/distribution-service.ts`

Extend existing service with:

```typescript
export async function submitRelease(
  releaseId: number,
  options: {
    actorId?: number;
    siteUrl?: string;
    retry?: boolean;
  } = {}
): Promise<{
  release: Release;
  validation: ValidationResult;
  submitted: boolean;
  distributorReleaseId?: string;
  upc?: string;
  trackIsrcs?: Record<number, string>;
  errors?: string[];
}>

export async function handleDistributorResponse(
  releaseId: number,
  response: DistributorResponse
): Promise<void>

export async function retrySubmission(
  releaseId: number,
  options?: { actorId?: number }
): Promise<void>

export async function syncDistributionStatus(
  releaseId: number
): Promise<{
  status: string;
  distributedAt?: Date;
  liveAt?: Date;
}>
```

---

## PHASE 5: ADMIN UI & WORKFLOWS

### 5.1 Add Distribution Section to AdminControlCenter

**File:** `components/admin-control-center.tsx`

Add new tab type:
```typescript
type AdminTab = 
  | ... existing tabs ...
  | 'releases-distribution'
  | 'distribution-queue'
```

Add Distribution Queue panel:
- Shows releases queued for distribution
- Shows current distribution status
- Shows error count
- Quick-access retry buttons

Add Release Distribution Detail view:
- Current status
- UPC/ISRC
- Submission timestamp
- Response data
- Warnings/errors
- Audit trail
- Manual retry button

### 5.2 Create Component: ReleaseDistributionSection

**File:** `components/release-distribution-section.tsx` (NEW)

Displays:
- Current distribution status
- UPC code
- ISRCs per track
- Submission date
- Approval date
- Distribution date
- API response (if applicable)
- Warnings (if any)
- Error message (if failed)
- Retry history
- Manual retry button (with confirmation)

### 5.3 Create Component: DistributionLogsView

**File:** `components/distribution-logs-view.tsx` (NEW)

Displays log entries:
- Request payload (expandable JSON)
- Response payload (expandable JSON)
- Warnings
- Errors
- Success/failure flag
- Timestamp

### 5.4 Create Component: AuditTrailView

**File:** `components/audit-trail-view.tsx` (NEW)

Displays audit log entries:
- Action (APPROVE_STARTED, VALIDATION_FAILED, SUBMITTED, RETRY, etc.)
- User (admin name)
- Timestamp
- Details (expandable)

### 5.5 Implement Admin Approval Flow

**File:** `app/api/admin/releases/[id]/approve/route.ts` (NEW)

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  
  const releaseId = Number((await params).id);
  const release = await getDetailedReleaseById(releaseId);
  
  if (!release) return notFound();
  
  // Validate release
  const validation = validateRelease(release);
  if (!validation.valid) {
    return badRequest({
      error: 'Release validation failed',
      issues: validation.errors,
    });
  }
  
  // Build payload
  const payload = buildDistributorPayload(release);
  
  // Submit to distributor
  try {
    const result = await submitWithRetry(releaseId, payload);
    
    // Store response
    await handleDistributorResponse(releaseId, result);
    
    // Log audit
    await createReleaseAuditLog({
      releaseId,
      userId: admin.sub || null,
      action: 'APPROVED_AND_SUBMITTED',
      details: { distributorReleaseId: result.distributorReleaseId },
    });
    
    return success({
      release: await getDetailedReleaseById(releaseId),
      distributorReleaseId: result.distributorReleaseId,
      upc: result.upc,
    });
  } catch (error) {
    // Log failure
    await createReleaseAuditLog({
      releaseId,
      userId: admin.sub || null,
      action: 'APPROVAL_FAILED',
      details: { error: error.message },
    });
    
    return serverError({ error: 'Submission failed' });
  }
}
```

### 5.6 Implement Manual Retry Flow

**File:** `app/api/admin/releases/[id]/retry/route.ts` (NEW)

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const releaseId = Number((await params).id);
  
  await retrySubmission(releaseId, { actorId: admin.sub || null });
  
  return success({
    release: await getDetailedReleaseById(releaseId),
  });
}
```

---

## PHASE 6: DATABASE FUNCTIONS

### 6.1 Extend distribution-db.ts

**File:** `lib/distribution-db.ts`

Add functions:

```typescript
export async function markReleaseDistributionSuccess(input: {
  releaseId: number;
  status: 'sent_to_distributor' | 'processing' | 'delivered';
  distributorReleaseId?: string;
  upc?: string;
  trackIsrcs?: Record<number, string>;
}): Promise<Release>

export async function updateReleaseStatus(
  releaseId: number,
  status: ReleaseStatus,
  note?: string
): Promise<Release | null>

export async function createReleaseAuditLog(input: {
  releaseId: number;
  userId?: number;
  action: string;
  details?: Record<string, any>;
}): Promise<void>

export async function listReleaseAuditLogs(
  releaseId: number
): Promise<ReleaseAuditLog[]>

export async function logDistributionEvent(input: {
  releaseId: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  warnings?: string[];
  errors?: string[];
  success: boolean;
}): Promise<void>

export async function listDistributionLogsByRelease(
  releaseId: number
): Promise<DistributionLog[]>
```

---

## PHASE 7: TESTING STRATEGY

### 7.1 Unit Tests

**File:** `__tests__/distribution-validation.test.ts`

Test validation logic:
- Required fields
- Track count rules
- URL format validation
- Name validation (first + last)
- Date logic

### 7.2 Integration Tests

**File:** `__tests__/distribution-integration.test.ts`

Test end-to-end:
- Validation → Payload building → Mock API submission → Response handling
- Error scenarios
- Retry logic
- Status updates

### 7.3 E2E Tests (Playwright)

**File:** `e2e/distribution-flow.spec.ts`

Test user flows:
- Create release with all required fields
- Submit for approval
- Admin approves
- Distributor API called
- UPC stored
- Status updated

---

## IMPLEMENTATION CHECKLIST

### Infrastructure (Week 1)
- [ ] Add .env.local with distributor credentials
- [ ] Execute database migrations
- [ ] Update Prisma schema and regenerate
- [ ] Verify database tables created

### Types & Validation (Week 1-2)
- [ ] Extend TypeScript types in lib/types.ts
- [ ] Create lib/distribution-validation.ts
- [ ] Create lib/distribution-payload.ts
- [ ] Add 20+ validation rules
- [ ] Test validation logic

### Frontend (Week 2)
- [ ] Extend release-form.tsx with 18 new fields
- [ ] Create content-type-selector component
- [ ] Create presave-date-selector component
- [ ] Create contributor-extended-form component
- [ ] Add client-side validation
- [ ] Test form with all content types

### API & Integration (Week 2-3)
- [ ] Create lib/distributor-client.ts
- [ ] Create lib/distributor-retry.ts
- [ ] Implement response parsing
- [ ] Implement retry logic
- [ ] Update lib/distribution-service.ts
- [ ] Create app/api/admin/releases/[id]/approve/route.ts
- [ ] Create app/api/admin/releases/[id]/retry/route.ts

### Admin UI (Week 3)
- [ ] Create release-distribution-section component
- [ ] Create distribution-logs-view component
- [ ] Create audit-trail-view component
- [ ] Integrate into AdminControlCenter
- [ ] Add Distribution Queue tab
- [ ] Test admin workflows

### Database Functions (Week 3)
- [ ] Extend lib/distribution-db.ts
- [ ] Implement all new database functions
- [ ] Test database operations

### Testing (Week 4)
- [ ] Create validation unit tests
- [ ] Create integration tests
- [ ] Create E2E tests
- [ ] Manual testing checklist
- [ ] Production readiness review

---

## SUCCESS CRITERIA

### Functional Requirements
✅ Artist submits release with all required metadata  
✅ HYMN validates release server-side  
✅ Admin reviews release in admin panel  
✅ Admin clicks "Approve"  
✅ HYMN automatically validates release  
✅ HYMN automatically generates distributor payload  
✅ HYMN authenticates with distributor API  
✅ HYMN submits release to distributor  
✅ HYMN receives and parses response  
✅ HYMN stores UPC and ISRCs  
✅ HYMN stores distributor_release_id  
✅ HYMN updates release status  
✅ HYMN creates audit log entry  
✅ HYMN creates distribution log entry  
✅ Admin sees updated status in UI  

### Non-Functional Requirements
✅ All secrets server-side only  
✅ No distributor credentials in frontend  
✅ No hardcoded endpoints  
✅ Comprehensive error handling  
✅ Automatic retry on transient failures  
✅ Full audit trail  
✅ Searchable logs  
✅ Production-ready deployment  

### Test Coverage
✅ Unit tests: 80%+ coverage on validation  
✅ Integration tests: All API paths  
✅ E2E tests: Happy path + error scenarios  
✅ Manual testing: All user workflows  

---

## ESTIMATED TIMELINE

| Phase | Tasks | Hours | Days |
|-------|-------|-------|------|
| 1 | Infrastructure & Config | 3 | 0.5 |
| 2 | Types & Validation | 9 | 1 |
| 3 | Frontend Enhancement | 12 | 1.5 |
| 4 | API & Integration | 10 | 1.5 |
| 5 | Admin UI & Workflows | 8 | 1 |
| 6 | Database Functions | 4 | 0.5 |
| 7 | Testing | 12 | 1.5 |
| **TOTAL** | | **58** | **7** |

**Realistic Timeline:** 2 weeks (with parallel work and optimization)

---

## DEPLOYMENT STRATEGY

### Pre-Production Testing
1. Test with mock distributor endpoint
2. Load testing with 100+ releases
3. Error scenario testing
4. Security review
5. Performance baseline

### Staging Deployment
1. Deploy to staging environment
2. Test with real distributor (sandbox API)
3. Monitor logs and metrics
4. User acceptance testing

### Production Deployment
1. Final security review
2. Backup database
3. Run migrations
4. Deploy code
5. Monitor deployment
6. Gradual rollout (10% → 50% → 100%)

### Rollback Plan
1. Keep previous code version ready
2. Database backup before migration
3. Rollback script prepared
4. Team on standby during deployment

---

## RISK MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-----------|--------|-----------|
| Distributor API changes | Low | High | Comprehensive error handling, versioning |
| Network failures | Medium | Medium | Automatic retry with exponential backoff |
| Data inconsistency | Low | High | Atomic transactions, audit logs |
| Performance degradation | Medium | Medium | Caching, pagination, connection pooling |
| Security breach | Low | Critical | Environment variables, server-side only |

---

## NEXT STEPS

1. **Immediate:** Obtain distributor API endpoint documentation
2. **Immediate:** Configure .env.local with credentials
3. **Day 1:** Execute database migrations
4. **Day 2-3:** Complete Phase 1-2 (Infrastructure + Types)
5. **Day 4-5:** Complete Phase 3 (Frontend)
6. **Day 6-7:** Complete Phase 4 (API Integration)
7. **Day 8:** Complete Phase 5-6 (Admin UI + Database)
8. **Day 9-10:** Complete Phase 7 (Testing + Verification)

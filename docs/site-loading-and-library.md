# Loading improvements and My library

## Verified bottlenecks

A read-only production audit found public Beatstore cover requests for 192px and
640px previews both returning the same 1400px original PNG (3,051,001 decoded
response bytes). The hosting edge served the extension-bearing upload path as a
static original, bypassing its width transformation. The extension-free dynamic
`/api/image-preview` endpoint successfully returned resized WebP files.

The navigation also prefetched unrelated pages, including the release wizard,
while users were loading other sections. The previous audio library mounted a
waveform analyser for each master, which fetched and decoded audio in the
background.

## Changes

- Public cover previews use `/api/image-preview` with the existing allowlisted
  public upload roots. Private downloads and original delivery URLs are unchanged.
- Shared navigation, header/footer and homepage links navigate on selection rather
  than prefetching every visible destination.
- The mobile homepage hero is 33,476 bytes instead of its 310,533-byte JPEG source;
  the desktop version is 73,960 bytes. The shared header logo is 5,424 bytes instead
  of 61,165 bytes. These are image-file reductions, not claimed page-load speedups.
- The cached homepage showcase selects at most 12 live, unarchived releases and
  their public display fields. It no longer loads the entire catalogue, track
  records and private release metadata. Explicit featured ordering is preserved.
- Homepage session validation and public preview loading run concurrently.

## My library

**My library** is a standalone sidebar link above the service groups on the
homepage and customer/producer workspaces. It has All items, Files and Purchases
views, search, sorting and 20 items per page.

Original files are selected by authenticated owner, ready status and non-deleted
state. One native preview player loads audio only after an explicit Preview click.
File download and Use in release actions use the existing authorised endpoints.
Purchases keep their existing standalone details and public licence URLs.

`/audio-library` redirects to `/library?view=files` and `/dashboard/purchases`
redirects to `/library?view=purchases`. Purchase detail and email links under
`/dashboard/purchases/:id` remain valid. Loading failures are isolated so available
files still show when purchases fail, and vice versa, with a retry action.

## Verification

- `npm run test:site-load`: isolated public-showcase and file-ownership checks,
  resized artwork dimensions/size, public-path validation and original preservation.
- `npm run test:user-library`: responsive views, search, pagination, download and
  licence links, and zero audio requests before Preview at 1440px, 390px and 320px.
- `npm run test:navigation-selection`: standalone navigation and selected-section
  behavior across public, customer, producer, admin and team workspaces.
- A production Next.js build runs against a disposable database using
  `tsx scripts/verify-acquisition-isolated.ts --site-load-only --build`.

Native Next image optimization remains disabled because the deployment's
`/_next/image` endpoint is unreliable; the dedicated preview preserves existing
hosting compatibility and original-asset access controls.

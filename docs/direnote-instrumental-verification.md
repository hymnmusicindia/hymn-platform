# Instrumental Mapping Verification

## Root Cause and Rule

Previously the payload mapper trusted a saved track language independently of
the version. An Instrumental track could therefore retain Hindi in the outgoing
`tracks[].trackLanguage` field. Earlier Magenta inspection recorded that mismatch.

The canonical `readTrackLanguage` function now derives Instrumental whenever the
track version is Instrumental, overriding null, blank, or stale language values.
Original tracks retain their own language. The wizard hides Track Language for
the Instrumental preset, and save/reload retains the version. A stale saved Hindi
value is deliberately retained in the regression fixture to prove that the
backend, not a lucky frontend default, controls the provider result.

## Executed Boundaries

The field-mapping suite checks the helper, real payload builder, validation and
canonical HTTP client against a loopback server. Seven valid payload cases cover
75 distinct normalized field paths with 540 exact received-value assertions.
The generated credential-redacted matrix is at
`.cache/direnote-http-field-connectivity.json`; each row includes source DB field,
mapper, provider path, actual received value and PASS/FAIL. Synthetic artifacts
remain ignored and are not shipped as application data.

The PostgreSQL lifecycle uses the actual submission service, status-sync service,
resubmission route and cron handler. The production-build browser flow selects
Instrumental, checks the language selector is absent, saves, reloads, and submits
corrections. The mock captures the second request and compares the complete body
against the canonical persisted snapshot. It checks new identifiers/current
attempt, original release/track identity, repeated-remark deduplication, and a
subsequent cron query using the new UPC. Additional service submissions cover
null and stale-Hindi database values independently of the browser.

The comprehensive field inventory and provider-support limitations remain in
`docs/direnote-field-mapping-audit.md`. DSP selections, territory and Dolby Atmos
have no documented ingestion fields; those HYMN-only settings are not falsely
counted as provider-delivered fields. This repair adds no undocumented keys.

## Live Versus Mock

After the database UPC lookup was unavailable, live status verification used
Magenta's existing UPC previously confirmed in production submission logs. The
official endpoint returned HTTP 401 with the supplied configuration. Authenticated
status retrieval, release data and remarks are therefore **NOT VERIFIED**.
No live ingestion was tested or performed. Valid provider credentials are needed
to verify authenticated live status retrieval.

Re-run with:

```text
node --import tsx scripts/verify-direnote-field-mapping.ts
node --import tsx scripts/verify-direnote-virtual.ts --build
node --import tsx scripts/verify-direnote-live-status.ts .env.production.download
```

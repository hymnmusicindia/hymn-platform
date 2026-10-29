# Marketplace and Studio operations

The admin Marketplace workspace separates Catalogue & QC, Producers, Beat orders,
Applications, Studio and Partnerships. Catalogue rows have bounded artwork, newest-first
ordering, search, pagination and an inspection panel. Refresh preserves successful
sections when another endpoint fails; visible workspaces refresh every 45 seconds and
announce new arrivals. Studio groups projects, engineers/services, applications, trust
and performance, with section-level loading fallbacks.

## Publication and rights

- An original beat can publish automatically, including a producer's first upload,
  only after metadata/pricing, artwork presence, active storefront, an explicit matching
  rights declaration and the private master's checksum/container checks pass.
- Sampled beats, source/declaration conflicts, missing files and existing correction
  restrictions require review. QC does not prove ownership or identify every sample.
- A bounded scheduled sweep retries pending versions after interrupted checks. Audits
  retain the decision, issues and checked version. Intentional unlisting is preserved.
- Exclusive offers are restricted to declarations of fully original material without
  third-party samples or non-exclusive loops. The rule applies to listing choices,
  quotes, reservations, direct purchase creation and payment fulfilment. Changed rights
  cannot silently convert an invalid exclusive payment into a successful purchase.

## Sample certificates

Submission requires the sample-provider certificate PDF and disclosure for third-party
material, plus confirmation that HYMN may supply the relevant agreement to buyers.
Existing beats have a dedicated owner-only correction page. Uploading a certificate
disables exclusivity and returns the beat to permission review; supplying a PDF alone
never automatically approves sample rights.

Checkout freezes the applicable certificate asset IDs with the licence terms. Licensed
buyers can download those certificates from their purchase details page. Receipt emails
attach them within the existing size budget and always link to the purchase page. Other
accounts and revoked purchases cannot use the buyer certificate endpoint. Ownership
proof files remain private; uploading a new document does not rewrite older purchases.

Producer requests use HYMN SMTP via the existing scheduler. Requests bind to the current
producer email, have a single task/event key, suppress duplicates and stop if a certificate
arrives or the recipient changes. Ambiguous mail outcomes require review.

Splice reference: https://support.splice.com/en/articles/8652642-splice-sounds-licensing-faq
and https://splice.com/terms. Samples remain licensed source material; a certificate
does not transfer sample ownership or permit isolated sample redistribution.

## Verification

```text
node scripts/verify-marketplace-browser.cjs
node scripts/verify-beatstore-record-browser.cjs
node scripts/verify-beat-buyer-checkout.cjs
node scripts/verify-email.cjs
node --import tsx scripts/verify-checkout-order-persistence.ts
node --import tsx scripts/verify-direnote-virtual.ts --producer-workflow-only
node --import tsx scripts/verify-direnote-virtual.ts --beat-licensing-only
node --import tsx scripts/verify-direnote-virtual.ts --beat-delivery-only
```

Database tests use isolated PostgreSQL and mock email; they do not send production
messages or collect payments.

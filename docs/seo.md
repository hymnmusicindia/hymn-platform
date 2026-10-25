# HYMN search visibility

Public pages use `publicPageMetadata` for a descriptive title, concise description, canonical URL and matching Open Graph/Twitter preview. Public producer and engineer pages have their own metadata and breadcrumb JSON-LD; missing or unpublished profiles stay unavailable. Structured data describes the visible page and never invents ratings or guarantees. JSON-LD escapes `<` before embedding user-supplied names.

`/music-distribution` is the public overview linked from the footer. Its action opens the existing `/distribution/start` workflow. `/distribution` keeps its existing redirect behaviour. The public first-release offer remains indexable; private workspaces, administration and sign-in pages use `noindex` for Googlebot and general crawlers.

`/sitemap.xml` refreshes hourly and includes static public pages, canonical policies, genre pages and eligible published producer/engineer profiles. Profile modification dates come from the database. Static pages omit a date rather than falsely reporting a fresh update. Privacy and terms aliases canonicalise to their existing root pages and are not duplicated in the sitemap. Authentication remains the access control for private content; robots rules allow crawlers to read sign-in/noindex responses and permit public image previews while excluding other API endpoints.

`/opengraph-image` generates the 1200 × 630 HYMN social image. Profile covers are used only when they have a usable public HTTP(S) or local URL; generated data-URI posters fall back to the HYMN preview.

## Search Console setup

Set `GOOGLE_SITE_VERIFICATION` and/or `BING_SITE_VERIFICATION` to the actual property-verification tokens when available. After deployment, verify the production domain in Google Search Console and Bing Webmaster Tools and submit the production `/sitemap.xml`. Inspect the homepage, `/music-distribution`, `/beat-store`, `/studio` and a published profile. Check canonical selection, crawl/index status and mobile usability; monitor impressions, clicks and relevant search queries over time. These account-side steps are not performed by a code push.

Run `node scripts/verify-seo.cjs` for metadata, sitemap eligibility, canonical policy aliases, private indexing rules and structured-data checks. The generated PNG and Next HTTP routes should also be checked when changing metadata conventions. No database migration is required.

References: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing). These improvements support crawling and relevance; search engines decide indexing and ranking.

import type { BrowserContext } from '@playwright/test';

export const customerFixtureOrigin = 'http://127.0.0.1:35510';
export const customerFixturePublicOrigin = process.env.CUSTOMER_AUDIT_PUBLIC_ORIGIN || customerFixtureOrigin;
export const customerFixtureHeaders: Record<string,string> = customerFixturePublicOrigin === customerFixtureOrigin ? {} : {'x-forwarded-proto':'https'};

// Production rejects loopback as the public origin. Simulate the public-facing
// reverse proxy in the test client; every request still targets the local fixture.
// Explicit API security probes bypass browser routing and retain their own Origin.
export async function configureCustomerFixtureBrowser(context: BrowserContext) {
  if (customerFixturePublicOrigin === customerFixtureOrigin) return;
  await context.route(`${customerFixtureOrigin}/api/**`, async route => {
    const headers = await route.request().allHeaders();
    if (!['GET','HEAD','OPTIONS'].includes(route.request().method())) headers.origin = customerFixturePublicOrigin;
    const response = await route.fetch({ headers });
    await route.fulfill({ response });
  });
}

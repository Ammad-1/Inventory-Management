import { db } from '../db';

/**
 * Shopify authentication for a Dev Dashboard app acting on our own store.
 *
 * Admin-created custom apps (the old `shpat_` token in the store admin) can no
 * longer be created, so there is no permanent token to paste. Instead the app
 * exchanges its client ID + secret for an access token that lives 24 hours,
 * and we refresh it on demand. The same client secret also keys webhook HMACs.
 */

export const DEFAULT_API_VERSION = '2026-07';

export interface ShopifyAuth {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
}

export const getShopifySettings = () =>
  db.prepare('SELECT * FROM shopify_settings WHERE id = ?').get('primary') as any;

/** Shop domain must be a genuine *.myshopify.com host, never a free-form URL. */
export function normaliseShopDomain(input: string): string {
  const cleaned = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    throw new Error('Shop domain must look like your-store.myshopify.com');
  }
  return cleaned;
}

/**
 * Return a usable access token, refreshing when it is missing or close to
 * expiry. The token is cached in the database so a restart does not force a
 * new exchange, and a 2-minute margin avoids racing the expiry.
 */
export async function getValidShopifyToken(): Promise<ShopifyAuth> {
  const s = getShopifySettings();
  if (!s?.shop_domain) throw new Error('Shopify is not configured — add your shop domain');
  if (!s.client_id || !s.client_secret) {
    throw new Error('Shopify client ID and secret are required (Dev Dashboard → Settings)');
  }

  const apiVersion = s.api_version || DEFAULT_API_VERSION;
  const expiresAt = s.token_expires_at ? new Date(s.token_expires_at).getTime() : 0;

  if (s.access_token && expiresAt - Date.now() > 120_000) {
    return { shopDomain: s.shop_domain, accessToken: s.access_token, apiVersion };
  }

  const res = await fetch(`https://${s.shop_domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: s.client_id,
      client_secret: s.client_secret
    })
  });

  const text = await res.text();
  if (!res.ok) {
    // Shopify returns an HTML error page here, with the real reason in the
    // <title>. Pull it out rather than hiding it behind a generic message.
    const oauthError =
      text.match(/Oauth error ([a-z_]+)/i)?.[1] ||
      (() => { try { return JSON.parse(text).error; } catch { return null; } })();

    const explain: Record<string, string> = {
      application_cannot_be_found:
        'Shopify cannot find an app with that Client ID. Check the Client ID is the plain hex value from Dev Dashboard → Settings, not the shpss_ secret.',
      app_not_installed:
        'The credentials are correct, but this app is not installed on this store. In the Dev Dashboard open the app, use Install app on the Installs card, and pick this store.',
      invalid_grant: 'Shopify refused the grant. Confirm the store belongs to the same organisation as the app.',
      invalid_client: 'The Client ID and Secret do not match an app Shopify recognises.',
      invalid_request: 'Shopify rejected the token request as malformed.',
      unauthorized_client: 'This app is not allowed to use the client credentials grant on this store.'
    };

    throw new Error(
      oauthError
        ? `Shopify: ${oauthError}${explain[oauthError] ? ' — ' + explain[oauthError] : ''}`
        : `Shopify token exchange failed (${res.status})`
    );
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Shopify returned an unreadable token response');
  }
  if (!data.access_token) throw new Error('Shopify returned no access token');

  const newExpiry = new Date(Date.now() + (Number(data.expires_in) || 86399) * 1000).toISOString();
  db.prepare(
    "UPDATE shopify_settings SET access_token = ?, token_expires_at = ?, updated_at = ? WHERE id = 'primary'"
  ).run(data.access_token, newExpiry, new Date().toISOString());

  return { shopDomain: s.shop_domain, accessToken: data.access_token, apiVersion };
}

/**
 * Call the GraphQL Admin API. REST became a legacy API in October 2024 and
 * newer apps are expected to use GraphQL, so everything goes through here.
 */
export async function shopifyGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const auth = await getValidShopifyToken();

  const res = await fetch(
    `https://${auth.shopDomain}/admin/api/${auth.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': auth.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error('Shopify rejected the request. The app may not be installed, or a scope is missing.');
  }
  if (res.status === 429) {
    throw new Error('Shopify rate limit hit. Wait a moment and try again.');
  }
  if (!res.ok) throw new Error(`Shopify returned ${res.status}: ${text.slice(0, 200)}`);

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('Shopify returned an unreadable response');
  }

  // GraphQL reports failures with HTTP 200 and an errors array
  if (body.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${body.errors.map((e: any) => e.message).join('; ')}`);
  }
  return body.data as T;
}

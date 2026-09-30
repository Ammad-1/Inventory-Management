import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Product photographs for the quote PDF.
 *
 * The images live on supplier and shop CDNs, but pdfkit needs bytes, not a
 * URL. They are fetched once and cached on disk: a quote is regenerated
 * every time it is downloaded, and re-fetching the same photograph on each
 * one would make the download depend on a supplier's website being up.
 *
 * A failed fetch is not an error worth failing a quote over. Every path
 * here returns null and the document falls back to no picture.
 */

const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'product-images');
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 6000;
/** pdfkit reads JPEG and PNG only; anything else is not worth fetching. */
const USABLE = new Set(['image/jpeg', 'image/jpg', 'image/png']);

const keyFor = (url: string) => crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);

/** Refuses anything that could reach the machine's own network. */
function isPublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') ||
    host === '::1' || host === '[::1]' ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return u;
}

/** Sniff the real format, since a CDN's content-type is not always honest. */
function detectFormat(buf: Buffer): 'jpeg' | 'png' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  return null;
}

/**
 * The bytes of a product image, from cache or the network.
 * Returns null whenever it cannot be had, which callers treat as "no photo".
 */
export async function getProductImage(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;

  const target = isPublicHttpUrl(String(url));
  if (!target) return null;

  const cached = path.join(CACHE_DIR, keyFor(String(url)));
  try {
    if (fs.existsSync(cached)) {
      const buf = fs.readFileSync(cached);
      if (buf.length && detectFormat(buf)) return buf;
    }
  } catch {
    /* an unreadable cache entry is simply a miss */
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'PrintBerryIQ/1.0 (+quote document)', Accept: 'image/*' }
    });
    if (!res.ok) return null;

    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type && !USABLE.has(type)) return null;

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES || !detectFormat(buf)) return null;

    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cached, buf);
    } catch {
      /* caching is an optimisation, not a requirement */
    }
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A print-area diagram shipped with the app, by its stored path. */
export function getPrintAreaImage(imagePath: string | null | undefined): Buffer | null {
  if (!imagePath) return null;
  // Stored as a served path like /print-areas/mug-main-body.jpg
  const clean = String(imagePath).replace(/^\/+/, '');
  if (clean.includes('..')) return null;

  const file = path.resolve(process.cwd(), 'public', clean);
  const root = path.resolve(process.cwd(), 'public');
  if (!file.startsWith(root)) return null;

  try {
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

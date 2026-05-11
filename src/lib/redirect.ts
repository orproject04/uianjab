const DEFAULT_ALLOWED_PATH_PREFIXES = [
  '/',
  '/dashboard',
  '/peta-jabatan',
  '/feedback',
  '/persesjen',
  '/rekom-jf',
  '/sync-pegawai',
  '/anjab',
  '/help',
];

const REDIRECT_BASE_URL = 'http://localhost';

function hasAllowedPrefix(pathname: string, allowPrefixes: string[]) {
  return allowPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function sanitizeInternalNext(
  value: unknown,
  fallback: string = '/',
  allowPrefixes: string[] = DEFAULT_ALLOWED_PATH_PREFIXES,
) {
  if (typeof value !== 'string') return fallback;

  const raw = value.trim();
  if (!raw) return fallback;

  // Reject obvious absolute / scheme-based payloads early.
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) || raw.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, REDIRECT_BASE_URL);

    // Only allow same-origin relative URLs resolved against the base.
    if (parsed.origin !== new URL(REDIRECT_BASE_URL).origin) {
      return fallback;
    }

    if (!hasAllowedPrefix(parsed.pathname, allowPrefixes)) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export { DEFAULT_ALLOWED_PATH_PREFIXES };

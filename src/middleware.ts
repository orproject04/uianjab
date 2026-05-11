import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

const REDIRECT_BASE_ORIGIN = 'http://localhost';
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

function hasAllowedPrefix(pathname: string) {
  return DEFAULT_ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function sanitizeNext(raw: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject schemes and protocol-relative
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) || trimmed.startsWith('//')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, REDIRECT_BASE_ORIGIN);
    if (parsed.origin !== new URL(REDIRECT_BASE_ORIGIN).origin) return null;
    if (!hasAllowedPrefix(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  if (url.pathname === '/signin' && url.searchParams.has('next')) {
    const raw = url.searchParams.get('next');
    const safe = sanitizeNext(raw);
    if (safe) {
      url.searchParams.set('next', safe);
    } else {
      url.searchParams.delete('next');
    }
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/signin'],
};

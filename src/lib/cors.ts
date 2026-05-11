// src/lib/cors.ts
import { NextRequest, NextResponse } from "next/server";

// Konfigurasi CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
  : [];

// Helper function untuk check apakah origin diizinkan
// Support exact match dan wildcard pattern
// Contoh: *.dpd.go.id, https://*.dpd.go.id, https://pandawa-ortala.dpd.go.id
function isOriginAllowed(origin: string, allowList: string[]): boolean {
  try {
    const originHost = new URL(origin).host; // e.g. cmb.dpd.go.id or cmb.dpd.go.id:443

    return allowList.some((pattern) => {
      // Normalize pattern by stripping scheme if present
      const raw = pattern.replace(/^https?:\/\//, '');

      // Exact host match
      if (raw === originHost) return true;

      // Wildcard matching on host (support *.dpd.go.id)
      // Escape regex special chars except '*', then replace '*' with '.*'
      const escaped = raw.replace(/[-/\\^$+?.()|[\\]{}]/g, '\\$&');
      const regexPattern = escaped.replace(/\*/g, '.*');

      try {
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(originHost);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// Fungsi untuk membuat headers CORS
export function corsHeaders(origin: string | null) {
  // Jika origin tidak ada atau tidak di whitelist, kembalikan header kosong
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) {
    return {} as Record<string, string>;
  }

  // Hanya kirim header preflight dan credentials untuk origin yang diizinkan
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
  };

  return headers;
}

// Handler untuk OPTIONS request (preflight)
export function handleCorsOptions(request: Request) {
  const origin = request.headers.get('origin');
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: corsHeaders(origin),
    }
  );
}

// Helper untuk menambahkan CORS headers ke response yang sudah ada
export function addCorsHeaders(response: NextResponse, origin: string | null) {
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Wrapper function untuk handle API route dengan CORS
export function withCors<T extends any[]>(
  handler: (req: NextRequest, origin: string | null, ...args: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    const origin = req.headers.get('origin');
    
    try {
      const response = await handler(req, origin, ...args);
      return addCorsHeaders(response, origin);
    } catch (error) {
      console.error('[CORS Wrapper] Error:', error);
      const response = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
      return addCorsHeaders(response, origin);
    }
  };
}

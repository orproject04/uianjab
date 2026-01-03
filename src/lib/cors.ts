// src/lib/cors.ts
import { NextRequest, NextResponse } from "next/server";

// Konfigurasi CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

// Fungsi untuk membuat headers CORS
export function corsHeaders(origin: string | null) {
  // Jika dalam development, izinkan semua origins
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
  };

  // Tentukan origin yang diizinkan
  if (isDevelopment) {
    // Di development, izinkan origin yang diminta atau fallback ke localhost:3000
    headers['Access-Control-Allow-Origin'] = origin || 'http://localhost:3000';
  } else {
    // Di production, cek apakah origin ada dalam daftar yang diizinkan
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    } else {
      headers['Access-Control-Allow-Origin'] = allowedOrigins[0];
    }
  }

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

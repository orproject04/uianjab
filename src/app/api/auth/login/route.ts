import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import pool from "@/lib/db";
import {
    comparePassword,
    signAccessToken,
    signRefreshToken,
    ACCESS_TOKEN_MAXAGE_SEC
} from "@/lib/auth";
import { generateUserAgentHash } from "@/lib/fingerprint";
import { hashRefreshToken } from "@/lib/tokens";
import { handleCorsOptions, addCorsHeaders } from "@/lib/cors";
import { getClientIp, checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/rate-limit";

// Handle preflight OPTIONS request
export async function OPTIONS(req: NextRequest) {
    return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
    const origin = req.headers.get('origin');
    try {
        const ip = getClientIp(req);
        const { email, password } = await req.json().catch(() => ({}));

        if (!email || !password) {
            const response = NextResponse.json({ error: "Email & password wajib dikirim" }, { status: 400 });
            return addCorsHeaders(response, origin);
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const rateLimitKey = `login:${ip}:${normalizedEmail}`;
        const ipRateLimitKey = `login_ip:${ip}`;

        // 1. Cek rate-limit (maksimal 5 percobaan gagal per 1 menit)
        const limitCheck = checkRateLimit(rateLimitKey, 5, 60 * 1000, 60 * 1000);
        const ipLimitCheck = checkRateLimit(ipRateLimitKey, 10, 60 * 1000, 60 * 1000);

        if (!limitCheck.allowed || !ipLimitCheck.allowed) {
            const retryAfter = Math.max(limitCheck.retryAfterSeconds, ipLimitCheck.retryAfterSeconds);
            const response = NextResponse.json(
                { error: `Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${retryAfter} detik.` },
                { 
                    status: 429,
                    headers: {
                        'Retry-After': String(retryAfter),
                        'X-RateLimit-Limit': '5',
                        'X-RateLimit-Remaining': '0',
                    }
                }
            );
            return addCorsHeaders(response, origin);
        }

        const { rows } = await pool.query(
            `SELECT id,email,password_hash,is_email_verified,role,full_name
             FROM user_anjab
             WHERE LOWER(email)=$1`,
            [normalizedEmail]
        );

        if (!rows.length) {
            const failStatus = recordFailedAttempt(rateLimitKey, 5, 60 * 1000, 60 * 1000);
            recordFailedAttempt(ipRateLimitKey, 10, 60 * 1000, 60 * 1000);

            if (!failStatus.allowed) {
                const response = NextResponse.json(
                    { error: `Terlalu banyak percobaan login gagal. Akses dibatasi sementara selama ${failStatus.retryAfterSeconds} detik.` },
                    { 
                        status: 429,
                        headers: {
                            'Retry-After': String(failStatus.retryAfterSeconds),
                            'X-RateLimit-Limit': '5',
                            'X-RateLimit-Remaining': '0',
                        }
                    }
                );
                return addCorsHeaders(response, origin);
            }

            const response = NextResponse.json({ error: "Email / Password salah" }, { status: 401 });
            return addCorsHeaders(response, origin);
        }
        const user = rows[0];

        if (!user.is_email_verified) {
            const response = NextResponse.json({ error: "Email belum diverifikasi" }, { status: 403 });
            return addCorsHeaders(response, origin);
        }

        const ok = await comparePassword(password, user.password_hash);
        if (!ok) {
            const failStatus = recordFailedAttempt(rateLimitKey, 5, 60 * 1000, 60 * 1000);
            recordFailedAttempt(ipRateLimitKey, 10, 60 * 1000, 60 * 1000);

            if (!failStatus.allowed) {
                const response = NextResponse.json(
                    { error: `Terlalu banyak percobaan login gagal. Akses dibatasi sementara selama ${failStatus.retryAfterSeconds} detik.` },
                    { 
                        status: 429,
                        headers: {
                            'Retry-After': String(failStatus.retryAfterSeconds),
                            'X-RateLimit-Limit': '5',
                            'X-RateLimit-Remaining': '0',
                        }
                    }
                );
                return addCorsHeaders(response, origin);
            }

            const response = NextResponse.json({ error: "Email / Password salah" }, { status: 401 });
            return addCorsHeaders(response, origin);
        }

        // Login sukses: bersihkan limit
        clearRateLimit(rateLimitKey);
        clearRateLimit(ipRateLimitKey);

        const userAgent = req.headers.get('user-agent');
        const fp = generateUserAgentHash(userAgent);

        const access  = signAccessToken({ sub: user.id, email: user.email, role: user.role, full_name: user.full_name, fp });
        const refresh = signRefreshToken({ sub: user.id, fp });

        // simpan HASH refresh di DB
        const refreshHash = hashRefreshToken(refresh);
        const expires     = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
        await pool.query(
            `INSERT INTO user_session (user_id, refresh_token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, refreshHash, expires]
        );

        // Set HTTP-only cookies menggunakan cookies() API
        const cookieStore = await cookies();
        const isProduction = process.env.NODE_ENV === 'production';
        const isHttps = req.headers.get('x-forwarded-proto') === 'https' || Boolean(process.env.APP_URL?.startsWith('https://'));
        const isSecure = isProduction || isHttps;
        
        cookieStore.set('access_token', access, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
            maxAge: ACCESS_TOKEN_MAXAGE_SEC,
            path: '/',
        });
        
        cookieStore.set('refresh_token', refresh, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
        });

        // Return tokens di body untuk aplikasi eksternal (mobile/desktop/API consumers)
        // Browser tetap bisa pakai cookies (lebih aman)
        const response = NextResponse.json({
            ok: true,
            message: "Login berhasil",
            access_token: access,
            refresh_token: refresh,
            token_type: "Bearer",
            expires_in: ACCESS_TOKEN_MAXAGE_SEC,
        }, { status: 200 });
        
        return addCorsHeaders(response, origin);
    } catch (err) {
        console.error('[LOGIN] Error:', err);
        const response = NextResponse.json({ error: "Gagal login" }, { status: 500 });
        return addCorsHeaders(response, origin);
    }
}

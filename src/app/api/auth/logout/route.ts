// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { hashRefreshToken } from "@/lib/tokens";

/**
 * Logout: ambil refresh token dari cookie atau fallback ke Authorization/body.
 * Server akan revoke session dan clear cookies.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const cookieRefresh = cookieStore.get('refresh_token')?.value;
    const auth = req.headers.get("authorization") || "";
    const headerRefresh = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const body = await req.json().catch(() => ({}));
    const refresh = cookieRefresh || headerRefresh || body?.refresh_token;

    if (refresh) {
        await pool.query(
            `UPDATE user_session
          SET is_revoked = true,
              last_used_at = now()
        WHERE refresh_token_hash = $1`,
            [hashRefreshToken(refresh)]
        );
    }

    // Clear HTTP-only cookies
    cookieStore.delete('access_token');
    cookieStore.delete('refresh_token');

    return NextResponse.json({ ok: true, message: "Logout berhasil" }, { status: 200 });
}

// src/app/api/auth/logout/route.ts
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { hashRefreshToken } from "@/lib/tokens";

/**
 * Logout: kirim refresh token via Authorization Bearer atau body { refresh_token }.
 * Server akan revoke baris user_session yg cocok. Tidak ada cookie yang dibersihkan.
 */
export async function POST(req: NextRequest) {
    const auth = req.headers.get("authorization") || "";
    const headerRefresh = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const body = await req.json().catch(() => ({}));
    const refresh = headerRefresh || body?.refresh_token;

    if (refresh) {
        await pool.query(
            `UPDATE user_session
          SET is_revoked = true,
              last_used_at = now()
        WHERE refresh_token_hash = $1`,
            [hashRefreshToken(refresh)]
        );
    }

    return Response.json({ ok: true }, { status: 200 });
}

// src/app/api/auth/refresh/route.ts
import { cookies } from "next/headers";
import pool from "@/lib/db";
import {
    verifyRefreshToken,
    signAccessToken,
    signRefreshToken,
    httpOnlyCookie,
    ACCESS_TOKEN_MAXAGE_SEC,
    REFRESH_TOKEN_MAXAGE_SEC,
} from "@/lib/auth";
import { hashRefreshToken } from "@/lib/tokens";

export async function POST() {
    // ⬇️ perbaikan: cookies() harus di-await
    const cookieStore = await cookies();
    const refresh = cookieStore.get("refresh_token")?.value;
    if (!refresh) return Response.json({ error: "No refresh token" }, { status: 401 });

    try {
        const dec: any = verifyRefreshToken(refresh); // tetap sama

        const refreshHash = hashRefreshToken(refresh);
        const { rows } = await pool.query(
            `SELECT us.id, us.expires_at,
                    u.id AS user_id, u.email, u.role
             FROM user_session us
                      JOIN user_anjab u ON u.id = us.user_id
             WHERE us.refresh_token_hash = $1
               AND COALESCE(us.is_revoked, false) = false
               AND us.expires_at > now()`,
            [refreshHash]
        );
        if (!rows.length) return Response.json({ error: "Invalid session" }, { status: 401 });

        const sess = rows[0];

        // Rotasi tetap
        const access     = signAccessToken({ sub: sess.user_id, email: sess.email, role: sess.role });
        const newRefresh = signRefreshToken({ sub: sess.user_id });
        const newHash    = hashRefreshToken(newRefresh);
        const newExpiry  = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

        await pool.query(
            `UPDATE user_session
             SET refresh_token_hash = $1,
                 expires_at         = $2,
                 last_used_at       = now()
             WHERE id = $3`,
            [newHash, newExpiry, sess.id]
        );

        const headers = new Headers();
        headers.append("Set-Cookie", httpOnlyCookie("access_token",  access,     ACCESS_TOKEN_MAXAGE_SEC));
        headers.append("Set-Cookie", httpOnlyCookie("refresh_token", newRefresh, REFRESH_TOKEN_MAXAGE_SEC));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch {
        return Response.json({ error: "Invalid refresh" }, { status: 401 });
    }
}

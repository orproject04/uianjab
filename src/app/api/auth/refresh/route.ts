// src/app/api/auth/refresh/route.ts
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import {
    verifyRefreshToken,
    signAccessToken,
    signRefreshToken,
    ACCESS_TOKEN_MAXAGE_SEC
} from "@/lib/auth";
import { hashRefreshToken } from "@/lib/tokens";

export async function POST(req: NextRequest) {
    // Ambil refresh dari Authorization: Bearer <rt> atau body { refresh_token }
    const auth = req.headers.get("authorization") || "";
    const headerRefresh = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const body = await req.json().catch(() => ({}));
    const refresh = headerRefresh || body?.refresh_token;

    if (!refresh) return Response.json({ error: "Tidak ada refresh token" }, { status: 401 });

    try {
        verifyRefreshToken(refresh); // cek signature & exp

        const { rows } = await pool.query(
            `SELECT us.id, u.id AS user_id, u.email, u.role, u.full_name
         FROM user_session us
         JOIN user_anjab u ON u.id = us.user_id
        WHERE us.refresh_token_hash = $1
          AND COALESCE(us.is_revoked,false) = false
          AND us.expires_at > now()
        LIMIT 1`,
            [hashRefreshToken(refresh)]
        );
        if (!rows.length) return Response.json({ error: "Invalid session, Silakan login kembali" }, { status: 401 });

        const sess = rows[0];

        // Rotasi refresh token
        const newAccess  = signAccessToken({ sub: sess.user_id, email: sess.email, role: sess.role, full_name: sess.full_name });
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

        return Response.json({
            ok: true,
            token_type: "Bearer",
            access_token: newAccess,
            refresh_token: newRefresh,
            expires_in: ACCESS_TOKEN_MAXAGE_SEC,
        }, { status: 200 });
    } catch {
        return Response.json({ error: "Invalid refresh, Silakan login kembali" }, { status: 401 });
    }
}

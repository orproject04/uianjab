// src/app/api/auth/refresh/route.ts
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { verifyRefreshToken, signAccessToken, httpOnlyCookie, ACCESS_TOKEN_MAXAGE_SEC } from "@/lib/auth";

export async function POST() {
    const cookieStore = await cookies();
    const refresh = cookieStore.get("refresh_token")?.value;
    if (!refresh) return Response.json({ error: "No refresh token" }, { status: 401 });

    try {
        const dec: any = verifyRefreshToken(refresh);

        const { rows } = await pool.query(
            `SELECT us.id, u.id AS user_id, u.email, u.role
             FROM user_session us JOIN user_anjab u ON u.id=us.user_id
             WHERE us.refresh_token=$1 AND us.expires_at>now()`,
            [refresh]
        );
        if (!rows.length) return Response.json({ error: "Invalid session" }, { status: 401 });
        const rec = rows[0];

        const access = signAccessToken({ sub: rec.user_id, email: rec.email, role: rec.role });

        const headers = new Headers();
        headers.append("Set-Cookie", httpOnlyCookie("access_token", access, ACCESS_TOKEN_MAXAGE_SEC));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch {
        return Response.json({ error: "Invalid refresh" }, { status: 401 });
    }
}

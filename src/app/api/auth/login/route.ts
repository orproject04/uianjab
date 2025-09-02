import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { comparePassword, signAccessToken, signRefreshToken, httpOnlyCookie } from "@/lib/auth";
import { getClientMeta } from "@/lib/auth-guard";
import {
    ACCESS_TOKEN_MAXAGE_SEC,
    REFRESH_TOKEN_MAXAGE_SEC
} from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();
        if (!email || !password) return Response.json({ error: "Email & password wajib" }, { status: 400 });

        const { rows } = await pool.query(
            `SELECT id,email,password_hash,is_email_verified,role FROM user_anjab WHERE email=$1`,
            [email]
        );
        if (!rows.length) return Response.json({ error: "Email / Password salah" }, { status: 401 });
        const user = rows[0];

        const ok = await comparePassword(password, user.password_hash);
        if (!ok) return Response.json({ error: "Email / Password salah" }, { status: 401 });

        const access = signAccessToken({ sub: user.id, email: user.email, role: user.role });
        const refresh = signRefreshToken({ sub: user.id });

        const { ip, ua } = await getClientMeta();           // ← await
        const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
        await pool.query(
            `INSERT INTO user_session(user_id, refresh_token, user_agent, ip_address, expires_at)
             VALUES($1,$2,$3,$4,$5)`,
            [user.id, refresh, ua, ip, expires]
        );

        const headers = new Headers();
        headers.append("Set-Cookie", httpOnlyCookie("access_token", access, ACCESS_TOKEN_MAXAGE_SEC));
        headers.append("Set-Cookie", httpOnlyCookie("refresh_token", refresh, REFRESH_TOKEN_MAXAGE_SEC));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch {
        return Response.json({ error: "Gagal login" }, { status: 500 });
    }
}

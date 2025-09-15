// src/app/api/auth/login/route.ts
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import {
    comparePassword,
    signAccessToken,
    signRefreshToken,
    ACCESS_TOKEN_MAXAGE_SEC
} from "@/lib/auth";
import { hashRefreshToken } from "@/lib/tokens";

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();
        if (!email || !password) {
            return Response.json({ error: "Email & password wajib dikirim" }, { status: 400 });
        }

        const { rows } = await pool.query(
            `SELECT id,email,password_hash,is_email_verified,role,full_name
             FROM user_anjab
             WHERE email=$1`,
            [email]
        );
        if (!rows.length) return Response.json({ error: "Email / Password salah" }, { status: 401 });
        const user = rows[0];

        if (!user.is_email_verified) {
            return Response.json({ error: "Email belum diverifikasi" }, { status: 403 });
        }

        const ok = await comparePassword(password, user.password_hash);
        if (!ok) return Response.json({ error: "Email / Password salah" }, { status: 401 });

        const access  = signAccessToken({ sub: user.id, email: user.email, role: user.role, full_name: user.full_name });
        const refresh = signRefreshToken({ sub: user.id });

        // simpan HASH refresh di DB
        const refreshHash = hashRefreshToken(refresh);
        const expires     = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // atau pakai REFRESH_TOKEN_MAXAGE_SEC jika ingin konsisten
        await pool.query(
            `INSERT INTO user_session (user_id, refresh_token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, refreshHash, expires]
        );

        // Kembali JSON tokens (tanpa Set-Cookie)
        return Response.json({
            ok: true,
            token_type: "Bearer",
            access_token: access,
            refresh_token: refresh,
            expires_in: ACCESS_TOKEN_MAXAGE_SEC,
        }, { status: 200 });
    } catch {
        return Response.json({ error: "Gagal login" }, { status: 500 });
    }
}

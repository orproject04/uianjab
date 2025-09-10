// src/app/api/auth/logout/route.ts
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { hashRefreshToken } from "@/lib/tokens";

function clearCookie(name: string) {
    // Sesuaikan flags dengan httpOnlyCookie() milikmu
    return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function POST() {
    const cookieStore = await cookies();
    const refresh = cookieStore.get("refresh_token")?.value;

    if (refresh) {
        const h = hashRefreshToken(refresh);
        // Revoke sesi yang cocok dengan refresh token di browser ini
        await pool.query(
            `UPDATE user_session SET is_revoked = true, last_used_at = now()
        WHERE refresh_token_hash = $1`,
            [h]
        );
    }

    // Kosongkan cookie access & refresh
    const headers = new Headers();
    headers.append("Set-Cookie", clearCookie("access_token"));
    headers.append("Set-Cookie", clearCookie("refresh_token"));

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

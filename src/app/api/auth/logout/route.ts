import { cookies } from "next/headers";
import pool from "@/lib/db";

export async function POST() {
    const cookieStore = await cookies();                 // ← await
    const refresh = cookieStore.get("refresh_token")?.value;

    if (refresh) await pool.query(`DELETE FROM user_session WHERE refresh_token=$1`, [refresh]);

    const headers = new Headers();
    headers.append("Set-Cookie", "access_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    headers.append("Set-Cookie", "refresh_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

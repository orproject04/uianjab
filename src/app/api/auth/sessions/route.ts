import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";

export async function GET() {
    const user = getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { rows } = await pool.query(
        `SELECT id, user_agent, ip_address, expires_at, created_at
     FROM user_session WHERE user_id=$1 ORDER BY created_at DESC`,
        [user.id]
    );
    return Response.json({ ok: true, data: rows });
}

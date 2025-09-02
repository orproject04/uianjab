import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";

export async function GET() {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Ambil full_name dari DB
    const { rows } = await pool.query(`SELECT full_name FROM user_anjab WHERE id=$1`, [user.id]);
    const full_name = rows[0]?.full_name || null;

    return Response.json({ ok: true, data: { ...user, full_name } }, { status: 200 });
}

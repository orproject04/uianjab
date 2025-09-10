import { NextRequest } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return Response.json({ error: "Token wajib dikirim" }, { status: 400 });

    const { rows } = await pool.query(
        `SELECT id, user_id, expires_at, used_at FROM email_verification WHERE token=$1`,
        [token]
    );
    if (!rows.length) return Response.json({ error: "Token tidak valid" }, { status: 400 });
    const rec = rows[0];

    if (rec.used_at) return Response.json({ error: "Token sudah dipakai" }, { status: 400 });
    if (new Date(rec.expires_at) < new Date()) return Response.json({ error: "Token kadaluarsa" }, { status: 400 });

    await pool.query(`UPDATE user_anjab SET is_email_verified=true WHERE id=$1`, [rec.user_id]);
    await pool.query(`UPDATE email_verification SET used_at=now() WHERE id=$1`, [rec.id]);

    // ⬇️ arahkan ke halaman signin milikmu
    return Response.redirect(`${process.env.APP_URL}/signin?verified=1`, 302);
}


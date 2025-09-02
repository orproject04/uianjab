import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
    const { token, new_password } = await req.json();
    if (!token || !new_password) return Response.json({ error: "Token & password baru wajib" }, { status: 400 });
    if (new_password.length < 8) return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });

    const { rows } = await pool.query(
        `SELECT id, user_id, expires_at, used_at FROM password_reset WHERE token=$1`,
        [token]
    );
    if (!rows.length) return Response.json({ error: "Token tidak valid" }, { status: 400 });
    const rec = rows[0];

    if (rec.used_at) return Response.json({ error: "Token sudah dipakai" }, { status: 400 });
    if (new Date(rec.expires_at) < new Date()) return Response.json({ error: "Token kadaluarsa" }, { status: 400 });

    const hash = await hashPassword(new_password);
    await pool.query(`UPDATE user_anjab SET password_hash=$1 WHERE id=$2`, [hash, rec.user_id]);
    await pool.query(`UPDATE password_reset SET used_at=now() WHERE id=$1`, [rec.id]);

    // Opsional: paksa logout semua sesi lain
    await pool.query(`DELETE FROM user_session WHERE user_id=$1`, [rec.user_id]);

    return Response.json({ ok: true });
}

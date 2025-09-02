import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { comparePassword, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
    const user = getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { current_password, new_password } = await req.json();
    if (!current_password || !new_password) return Response.json({ error: "Lengkapi field" }, { status: 400 });
    if (new_password.length < 8) return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });

    const { rows } = await pool.query(`SELECT password_hash FROM user_anjab WHERE id=$1`, [user.id]);
    const ok = await comparePassword(current_password, rows[0].password_hash);
    if (!ok) return Response.json({ error: "Password saat ini salah" }, { status: 400 });

    const hash = await hashPassword(new_password);
    await pool.query(`UPDATE user_anjab SET password_hash=$1, updated_at=now() WHERE id=$2`, [hash, user.id]);

    // Opsional: revoke semua sesi lain kecuali yang ini → sederhana: hapus semua
    await pool.query(`DELETE FROM user_session WHERE user_id=$1`, [user.id]);

    return Response.json({ ok: true });
}

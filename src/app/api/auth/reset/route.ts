import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashResetToken } from "@/lib/tokens";

export async function POST(req: NextRequest) {
    const { token, new_password } = await req.json();

    if (!token || !new_password) {
        return Response.json({ error: "Token & password baru wajib dikirim" }, { status: 400 });
    }
    if (new_password.length < 8) {
        return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Tandai token sekali-pakai + ambil user (race-safe)
        const tokenHash = hashResetToken(token);
        const upd = await client.query(
            `UPDATE password_reset
             SET used_at = now()
             WHERE token_hash = $1
               AND used_at IS NULL
               AND expires_at > now()
                 RETURNING id, user_id`,
            [tokenHash]
        );
        if (!upd.rows.length) {
            await client.query("ROLLBACK");
            return Response.json({ error: "Token tidak valid / kadaluarsa / sudah dipakai" }, { status: 400 });
        }
        const { user_id } = upd.rows[0];

        // Ganti password
        const hash = await hashPassword(new_password);
        await client.query(
            `UPDATE user_anjab SET password_hash = $1 WHERE id = $2`,
            [hash, user_id]
        );

        // Paksa logout semua sesi user ini
        await client.query(
            `DELETE FROM user_session WHERE user_id = $1`,
            [user_id]
        );

        await client.query("COMMIT");
        return Response.json({ ok: true });
    } catch (e) {
        await client.query("ROLLBACK");
        return Response.json({ error: "Gagal reset password" }, { status: 500 });
    } finally {
        client.release();
    }
}

// src/app/api/auth/forgot/route.ts
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { randomToken, hashResetToken } from "@/lib/tokens";
import { sendMail } from "@/lib/email";

export async function POST(req: NextRequest) {
    const { email } = await req.json();
    if (!email) return Response.json({ error: "Email wajib dikirim" }, { status: 400 });

    const client = await pool.connect();
    try {
        // 1) cek user
        const userQ = await client.query(
            `SELECT id, email FROM user_anjab WHERE email=$1 LIMIT 1`,
            [email]
        );
        if (!userQ.rows.length) {
            return Response.json({ error: "Email tidak terdaftar" }, { status: 404 });
        }
        const user = userQ.rows[0];

        await client.query("BEGIN");

        // 2) REVOKE semua token aktif lama (used_at IS NULL)
        await client.query(
            `UPDATE password_reset
             SET used_at = now()
             WHERE user_id = $1
               AND used_at IS NULL`,
            [user.id]
        );

        // 3) Buat token baru
        const plain = randomToken(32);
        const tokenHash = hashResetToken(plain);
        const exp = new Date(Date.now() + 1000 * 60 * 30); // 30 menit

        await client.query(
            `INSERT INTO password_reset (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, tokenHash, exp]
        );

        await client.query("COMMIT");

        // 4) Kirim email di luar transaksi
        const link = `${process.env.APP_URL}/reset-password?token=${plain}`;
        await sendMail(
            email,
            "Reset Password Anjab",
            `
        <p>Kamu meminta reset password.</p>
        <p>Klik tautan berikut (berlaku 30 menit): <a href="${link}">${link}</a></p>
        <p>Abaikan jika kamu tidak merasa meminta.</p>
      `
        );

        return Response.json({ ok: true, message: "Tautan reset telah dikirim ke email Anda." });
    } catch (e) {
        try { await (await pool.connect()).query("ROLLBACK"); } catch {}
        return Response.json({ error: "Gagal memproses permintaan" }, { status: 500 });
    } finally {
        client.release();
    }
}

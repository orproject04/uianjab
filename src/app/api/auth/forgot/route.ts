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

        // 4) Kirim email secara async (fire-and-forget untuk response cepat)
        const link = `${process.env.APP_URL}/reset-password?token=${plain}`;
        sendMail(
            email,
            "Reset Password Anjab",
            `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Kamu meminta reset password.</p>
        <p>Klik tautan berikut (berlaku 30 menit):
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        </p>
        <p>Abaikan jika kamu tidak merasa meminta.</p>
      `
        )
            .then(() => console.log("Password reset email sent to:", email))
            .catch((err) => console.error("Failed to send password reset email:", err));

        // Return response immediately tanpa tunggu email
        return Response.json({ ok: true, message: "Tautan reset telah dikirim ke email Anda." });
    } catch (e) {
        try { await (await pool.connect()).query("ROLLBACK"); } catch {}
        return Response.json({ error: "Gagal memproses permintaan" }, { status: 500 });
    } finally {
        client.release();
    }
}

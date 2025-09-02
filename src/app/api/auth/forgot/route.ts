import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { randomToken } from "@/lib/tokens";
import { sendMail } from "@/lib/email";

export async function POST(req: NextRequest) {
    const { email } = await req.json();
    if (!email) return Response.json({ error: "Email wajib" }, { status: 400 });

    const { rows } = await pool.query(`SELECT id FROM user_anjab WHERE email=$1`, [email]);
    if (rows.length) {
        const token = randomToken();
        const exp = new Date(Date.now() + 1000 * 60 * 30); // 30 menit
        await pool.query(
            `INSERT INTO password_reset(user_id, token, expires_at) VALUES($1,$2,$3)`,
            [rows[0].id, token, exp]
        );
        const link = `${process.env.APP_URL}/reset-password?token=${token}`;
        await sendMail(email, "Reset Password Anjab", `
      <p>Kamu meminta reset password.</p>
      <p>Klik tautan berikut (berlaku 30 menit): <a href="${link}">${link}</a></p>
      <p>Abaikan jika kamu tidak merasa meminta.</p>
    `);
    }
    // Selalu 200 agar tidak membocorkan keberadaan email
    return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { randomToken } from "@/lib/tokens";
import { sendMail } from "@/lib/email";

export async function POST(req: NextRequest) {
    try {
        const { email, password, full_name } = await req.json();
        if (!email || !password) return Response.json({ error: "Email & password wajib dikirim" }, { status: 400 });
        if (password.length < 8) return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
        if (!email.includes(".com")) return Response.json({ error: "Format email tidak valid" }, { status: 400 });

        const { rows: exist } = await pool.query(`SELECT 1 FROM user_anjab WHERE email=$1`, [email]);
        if (exist.length) return Response.json({ error: "Email sudah terdaftar" }, { status: 409 });

        const password_hash = await hashPassword(password);
        const { rows } = await pool.query(
            `INSERT INTO user_anjab(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING id,email,is_email_verified,role`,
            [email, password_hash, full_name || null]
        );
        const user = rows[0];

        const token = randomToken();
        const exp = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 jam
        await pool.query(
            `INSERT INTO email_verification(user_id, token, expires_at) VALUES($1,$2,$3)`,
            [user.id, token, exp]
        );

        const link = `${process.env.APP_URL}/api/auth/verify?token=${token}`;
        await sendMail(email, "Verifikasi Email Akun Anjab", `
      <p>Halo,</p>
      <p>Silakan verifikasi email kamu dengan klik tautan berikut:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Link berlaku 24 jam.</p>
    `);

        return Response.json({ ok: true, data: { id: user.id, email: user.email } }, { status: 201 });
    } catch {
        return Response.json({ error: "Gagal register" }, { status: 500 });
    }
}

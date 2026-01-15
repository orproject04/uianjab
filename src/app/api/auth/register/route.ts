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
        // Basic email format validation (allow any TLD, e.g. .go.id)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(email))) return Response.json({ error: "Format email tidak valid" }, { status: 400 });

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

        const verificationUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/auth/verify?token=${token}`;
    
        const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verifikasi Email Anda</h2>
        <p>Terima kasih telah mendaftar! Silakan klik tombol di bawah untuk memverifikasi email Anda:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verifikasi Email
          </a>
        </div>
        
        <p>Atau salin dan tempel link berikut ke browser Anda:</p>
        <p style="word-break: break-all; color: #666;">
          <a href="${verificationUrl}">${verificationUrl}</a>
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Link ini akan kadaluarsa dalam 24 jam. Jika Anda tidak meminta verifikasi ini, abaikan email ini.
        </p>
      </div>
    `;

        // Kirim email verifikasi
        try {
            await sendMail(email, "Verifikasi Email Anda", emailHtml);
        } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
            // Lanjutkan registrasi walaupun email gagal terkirim
            // User bisa resend verification nanti
        }

        return Response.json({ 
            ok: true, 
            data: { id: user.id, email: user.email },
            message: "Registrasi berhasil. Silakan cek email untuk verifikasi."
        }, { status: 201 });
    } catch (err) {
        console.error("Registration error:", err);
        return Response.json({ error: "Gagal register" }, { status: 500 });
    }
}

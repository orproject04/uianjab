import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pool from "@/lib/db";
import { randomToken } from "@/lib/tokens";
import { sendMail } from "@/lib/email";

const ResendSchema = z.object({
  email: z.string().email("Format email tidak valid"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ResendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Email tidak valid" },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Check if user exists and is not already verified
    const userCheck = await pool.query(
      `SELECT id, email, is_email_verified 
       FROM user_anjab
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (userCheck.rowCount === 0) {
      // Don't reveal if email exists for security, but return success
      return NextResponse.json({
        success: true,
        message: "Jika email terdaftar, email verifikasi telah dikirim.",
      });
    }

    const user = userCheck.rows[0];

    // If already verified, inform user
    if (user.email_verified_at) {
      return NextResponse.json(
        { error: "Email sudah terverifikasi. Silakan login." },
        { status: 400 }
      );
    }

    // Generate new verification token
    const verificationToken = randomToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update or insert verification token
    await pool.query(
      `INSERT INTO email_verification (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, verificationToken, expiresAt]
    );

    // Send verification email
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/verify-email?token=${verificationToken}`;
    
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

    try {
      await sendMail(email, "Verifikasi Email Akun Anda", emailHtml);
    } catch (emailError) {
      return NextResponse.json(
        { error: "Gagal mengirim email. Silakan coba lagi nanti." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email verifikasi berhasil dikirim. Silakan periksa inbox Anda.",
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}
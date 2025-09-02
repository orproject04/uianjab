import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { randomToken } from "@/lib/tokens";
import { sendMail } from "@/lib/email";

export async function POST(req: NextRequest) {
    const { email } = await req.json();
    if (!email) return Response.json({ error: "Email wajib" }, { status: 400 });

    const { rows } = await pool.query(`SELECT id,is_email_verified FROM user_anjab WHERE email=$1`, [email]);
    if (!rows.length) return Response.json({ ok: true }); // diam: jangan bocor
    const u = rows[0];
    if (u.is_email_verified) return Response.json({ ok: true });

    const token = randomToken();
    const exp = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await pool.query(`INSERT INTO email_verification(user_id, token, expires_at) VALUES($1,$2,$3)`, [u.id, token, exp]);

    const link = `${process.env.APP_URL}/api/auth/verify?token=${token}`;
    await sendMail(email, "Verifikasi Email Anjab (Ulang)", `<p><a href="${link}">${link}</a></p>`);
    return Response.json({ ok: true });
}

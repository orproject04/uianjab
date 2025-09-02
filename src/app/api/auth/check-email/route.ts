import { NextRequest } from "next/server";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();
        if (!email) return Response.json({ error: "Email wajib" }, { status: 400 });

        const { rows } = await pool.query(`SELECT 1 FROM user_anjab WHERE email=$1`, [email]);
        // Selalu 200; hanya beritahu exist atau tidak
        return Response.json({ ok: true, exists: rows.length > 0 }, { status: 200 });
    } catch {
        return Response.json({ error: "Gagal memeriksa email" }, { status: 500 });
    }
}

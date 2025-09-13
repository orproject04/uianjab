// src/app/api/anjab/[id]/uuid/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq } from "@/lib/auth";

/**
 * GET /api/anjab/[id]/uuid
 * - Mengembalikan hanya { id: uuid } berdasarkan slug (id = 2 segmen terakhir yang Anda pakai).
 * - Hanya bisa diakses oleh user yang sudah login.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        // === Auth: wajib login (role bebas)
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // === Params
        const { id } = await ctx.params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Bad Request: id (slug) wajib diisi" }, { status: 400 });
        }

        // === Query ringan: ambil UUID dari slug
        const { rows } = await pool.query<{ id: string }>(
            `SELECT id FROM jabatan WHERE slug = $1 LIMIT 1`,
            [id]
        );

        if (rows.length === 0) {
            return NextResponse.json({ error: "Not Found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
        }

        // === Beri respons hanya { id }
        return NextResponse.json(
            { id: rows[0].id },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            }
        );
    } catch (err) {
        console.error("GET /api/anjab/[id]/uuid error:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

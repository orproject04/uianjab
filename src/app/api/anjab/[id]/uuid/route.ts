// src/app/api/anjab/[id]/uuid/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq} from "@/lib/auth";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        // Auth wajib login
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        const {id} = await ctx.params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({error: "Bad Request: id (slug/uuid) wajib diisi"}, {status: 400});
        }

        const isUuid = UUID_RE.test(id);

        let row: { id: string } | undefined;

        if (isUuid) {
            // Jika UUID → coba cocokkan sebagai struktur_id (dan fallback: id langsung)
            const q = await pool.query<{ id: string }>(
                `
                    SELECT j.id
                    FROM jabatan j
                    WHERE j.struktur_id = $1::uuid
             OR j.id = $1::uuid
                        LIMIT 1
                `,
                [id]
            );
            row = q.rows[0];
        } else {
            // Jika bukan UUID → perlakukan sebagai slug (2 segmen terakhir yang kamu pakai)
            const q = await pool.query<{ id: string }>(
                `
                    SELECT id
                    FROM jabatan
                    WHERE slug = $1 LIMIT 1
                `,
                [id]
            );
            row = q.rows[0];
        }

        if (!row) {
            return NextResponse.json(
                {error: "Not Found"},
                {status: 404, headers: {"Cache-Control": "no-store"}}
            );
        }

        return NextResponse.json(
            {id: row.id},
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    Pragma: "no-cache",
                    Expires: "0",
                },
            }
        );
    } catch (err) {
        console.error("GET /api/anjab/[id]/uuid error:", err);
        return NextResponse.json({error: "Server error"}, {status: 500});
    }
}

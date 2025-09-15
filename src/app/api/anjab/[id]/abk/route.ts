// src/app/api/anjab/[id]/abk-needed/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        // 🔑 Auth: wajib login & admin
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params;

        // 🔹 Step 1: cek apakah ada tugas_pokok untuk jabatan_id
        const {rows: allRows} = await pool.query(
            `SELECT id, nomor_tugas
             FROM tugas_pokok
             WHERE jabatan_id = $1`,
            [id]
        );

        if (allRows.length === 0) {
            return NextResponse.json(
                {
                    needed: true,
                    reason: "NO_TUGAS_POKOK",
                    missing_count: 0,
                    examples: [],
                },
                {
                    headers: {
                        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0",
                    },
                }
            );
        }

        // 🔹 Step 2: cek incomplete rows
        const {rows: incomplete} = await pool.query(
            `
                SELECT id, nomor_tugas
                FROM tugas_pokok
                WHERE jabatan_id = $1
                  AND (
                    jumlah_hasil IS NULL
                        OR waktu_penyelesaian_jam IS NULL
                        OR waktu_efektif IS NULL
                        OR kebutuhan_pegawai IS NULL
                    )
                ORDER BY COALESCE(nomor_tugas, 999999), id LIMIT 5
            `,
            [id]
        );

        return NextResponse.json(
            {
                needed: incomplete.length > 0,
                reason: incomplete.length > 0 ? "INCOMPLETE" : "COMPLETE",
                missing_count: incomplete.length,
                examples: incomplete,
            },
            {
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            }
        );
    } catch (e: any) {
        if (e.message === "UNAUTHORIZED") {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }
        console.error("[abk-needed][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

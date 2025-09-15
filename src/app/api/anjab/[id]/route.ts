// app/api/anjab/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import {getUserFromReq, hasRole} from "@/lib/auth";

type Params = { id: string };

// Helper: cek UUID v1–v5
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
    return UUID_RE.test(s);
}

/**
 * GET /api/anjab/:id
 * - Wajib login (Bearer access token)
 * - Boleh id UUID atau slug (pakai getAnjabByIdOrSlug)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }

        const {id} = await ctx.params; // Next.js 15+: wajib await
        const data = await getAnjabByIdOrSlug(id);
        if (!data) {
            return NextResponse.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        return new NextResponse(JSON.stringify(data), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    } catch (e: any) {
        // Jika e.code = '22P02', kemungkinan dari CAST/::uuid di dalam getAnjabByIdOrSlug (kalau ada)
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, Format ID tidak sesuai"}, {status: 400});
        }
        console.error("[anjab][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

/**
 * DELETE /api/anjab/:id
 * - Admin-only
 * - HARUS UUID. Kalau bukan, balas 400 (bukan 500)
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params;

        // Lapis 1: early validation
        if (!isUuid(id)) {
            return NextResponse.json(
                {error: "Invalid, id harus UUID"},
                {status: 400}
            );
        }

        // Opsi tambahan: paksa cast di SQL -> jika somehow bukan UUID, PG lempar 22P02 (ditangani di catch)
        const del = await pool.query(
            `DELETE
             FROM jabatan
             WHERE id = $1::uuid`,
            [id]
        );

        if (del.rowCount === 0) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }
        return NextResponse.json({ok: true}, {status: 200});
    } catch (e: any) {
        // Lapis 2: map error PG "invalid_text_representation" jadi 400
        if (e?.code === "22P02") {
            return NextResponse.json(
                {error: "Invalid, id harus UUID"},
                {status: 400}
            );
        }
        console.error("[anjab][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

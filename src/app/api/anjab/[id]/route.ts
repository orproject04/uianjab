// app/api/anjab/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {getAnjabByIdOrSlug} from "@/lib/anjab-queries";
import {getUserFromReq, hasRole} from "@/lib/auth";

type Params = { id: string };

/**
 * GET /api/anjab/:id
 * - Wajib login (Bearer access token)
 * - Role bebas (user/editor/admin)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const user = getUserFromReq(req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        const {id} = await ctx.params; // ⬅️ WAJIB await (Next.js 15+)
        const data = await getAnjabByIdOrSlug(id);
        if (!data) {
            return NextResponse.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        return new NextResponse(JSON.stringify(data), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (e) {
        console.error("[anjab][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

/**
 * DELETE /api/anjab/:id
 * - Admin-only
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }

        const {id} = await ctx.params; // ⬅️ WAJIB await
        const del = await pool.query(`DELETE
                                      FROM jabatan
                                      WHERE id = $1`, [id]);

        if (del.rowCount === 0) {
            return NextResponse.json({error: "Not Found"}, {status: 404});
        }
        return NextResponse.json({ok: true}, {status: 200});
    } catch (e) {
        console.error("[anjab][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

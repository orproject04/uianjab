// app/api/anjab/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAnjabById } from "@/lib/anjab-queries";
import { getAuthUser, requireRole } from "@/lib/auth-guard";

type Params = { id: string };

// READ: GET /api/anjab/:id  (exposed / tidak perlu login)
export async function GET(_req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const { id } = await ctx.params; // ⬅️ WAJIB await
        const data = await getAnjabById(id);
        if (!data) {
            return NextResponse.json({ error: "Data Tidak Ditemukan" }, { status: 404 });
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
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

// HEAD: cek ketersediaan cepat
export async function HEAD(_req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const { id } = await ctx.params; // ⬅️ WAJIB await
        const data = await getAnjabById(id);
        return new NextResponse(null, { status: data ? 200 : 404 });
    } catch {
        return new NextResponse(null, { status: 500 });
    }
}

// DELETE: admin-only, hapus jabatan
export async function DELETE(_req: NextRequest, ctx: { params: Promise<Params> }) {
    try {
        const user = await getAuthUser(); // ⬅️ pastikan getAuthUser() juga async + await cookies()
        if (!user || !requireRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await ctx.params; // ⬅️ WAJIB await
        const del = await pool.query(`DELETE FROM jabatan WHERE id_jabatan = $1`, [id]);

        if (del.rowCount === 0) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e) {
        console.error("[anjab][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

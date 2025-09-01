// app/api/anjab/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAnjabById } from "@/lib/anjab-queries";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const data = await getAnjabById(id);
        if (!data) return Response.json({ error: "Data Tidak Ditemukan" }, { status: 404 });

        return Response.json(data, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (e) {
        console.error(e);
        return Response.json({ error: "General Error" }, { status: 500 });
    }
}

export async function HEAD(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const data = await getAnjabById(id);
        return new Response(null, { status: data ? 200 : 404 });
    } catch {
        return new Response(null, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;

        // Hapus baris utama; relasi lain akan ikut terhapus karena FOREIGN KEY ON DELETE CASCADE
        const del = await pool.query(`DELETE FROM jabatan WHERE id_jabatan = $1`, [id]);
        if (!del.rowCount) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[anjab][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}
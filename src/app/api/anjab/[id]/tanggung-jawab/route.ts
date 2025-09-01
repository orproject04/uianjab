import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// Single text cleaner: coerce -> trim -> not empty
const TextField = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Uraian tanggung jawab wajib diisi.");

// Body schema
const ItemSchema = z.object({
    uraian_tanggung_jawab: TextField,
});

// Replace-all schema (opsional)
const ReplaceAllSchema = z.array(ItemSchema);

// ===== Koleksi =====
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const { rows } = await pool.query(
            `SELECT id_tanggung_jawab, id_jabatan, uraian_tanggung_jawab, created_at, updated_at
       FROM tanggung_jawab
       WHERE id_jabatan = $1
       ORDER BY id_tanggung_jawab`,
            [id]
        );
        return NextResponse.json(rows, { headers: noCache });
    } catch (e) {
        console.error("[tanggung-jawab][GET]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const { id } = await ctx.params;
        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO tanggung_jawab
         (id_jabatan, uraian_tanggung_jawab, created_at, updated_at)
       VALUES ($1,$2, NOW(), NOW())
       RETURNING id_tanggung_jawab, id_jabatan, uraian_tanggung_jawab, created_at, updated_at`,
            [id, p.data.uraian_tanggung_jawab]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, data: ins.rows[0] });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[tanggung-jawab][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

// (Opsional) Replace-all
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const { id } = await ctx.params;
        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        await client.query("BEGIN");
        await client.query(`DELETE FROM tanggung_jawab WHERE id_jabatan=$1`, [id]);
        for (const it of p.data) {
            await client.query(
                `INSERT INTO tanggung_jawab
           (id_jabatan, uraian_tanggung_jawab, created_at, updated_at)
         VALUES ($1,$2, NOW(), NOW())`,
                [id, it.uraian_tanggung_jawab]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[tanggung-jawab][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

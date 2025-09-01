import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// coerce → trim → non-empty (wajib)
const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Nama risiko wajib diisi.");

// coerce → trim (opsional)
const TextOptional = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim());

const ItemSchema = z.object({
    nama_risiko: TextRequired,      // wajib
    penyebab: TextOptional.optional() // opsional
});

const ReplaceAllSchema = z.array(ItemSchema);

// ===== Koleksi =====
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const { rows } = await pool.query(
            `SELECT id_risiko, id_jabatan, nama_risiko, penyebab, created_at, updated_at
       FROM risiko_bahaya
       WHERE id_jabatan = $1
       ORDER BY id_risiko`,
            [id]
        );
        return NextResponse.json(rows, { headers: noCache });
    } catch (e) {
        console.error("[risiko-bahaya][GET]", e);
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

        const { nama_risiko, penyebab = "" } = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO risiko_bahaya
         (id_jabatan, nama_risiko, penyebab, created_at, updated_at)
       VALUES ($1,$2,$3, NOW(), NOW())
       RETURNING id_risiko, id_jabatan, nama_risiko, penyebab, created_at, updated_at`,
            [id, nama_risiko, penyebab]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, data: ins.rows[0] });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[risiko-bahaya][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

// (Opsional) replace-all: kirim array item, server hapus & isi ulang
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
        await client.query(`DELETE FROM risiko_bahaya WHERE id_jabatan=$1`, [id]);
        for (const it of p.data) {
            await client.query(
                `INSERT INTO risiko_bahaya
           (id_jabatan, nama_risiko, penyebab, created_at, updated_at)
         VALUES ($1,$2,$3, NOW(), NOW())`,
                [id, it.nama_risiko, it.penyebab ?? ""]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[risiko-bahaya][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

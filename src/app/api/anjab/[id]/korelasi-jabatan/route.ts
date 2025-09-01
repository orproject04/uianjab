import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// text → trim → non-empty (untuk field yang wajib)
const TextRequired = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim())
    .refine(s => s.length > 0, "Field wajib diisi.");

// text → trim (boleh kosong)
const TextOptional = z
    .union([z.string(), z.number()])
    .transform(v => String(v).trim());

// array cleaner: coerce -> trim -> buang kosong
const cleanStrArr = z
    .array(z.union([z.string(), z.number()]))
    .transform(arr => arr.map(v => String(v).trim()).filter(s => s.length > 0));

const ItemSchema = z.object({
    jabatan_terkait: TextRequired,               // wajib
    unit_kerja_instansi: TextOptional.optional(),// opsional
    dalam_hal: cleanStrArr.default([]),          // list mandiri
});

const ReplaceAllSchema = z.array(ItemSchema);

// ===== Koleksi =====
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const { rows } = await pool.query(
            `SELECT id_korelasi, id_jabatan, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at
       FROM korelasi_jabatan
       WHERE id_jabatan = $1
       ORDER BY id_korelasi`,
            [id]
        );
        // pastikan array tidak null
        const data = rows.map((r: any) => ({
            ...r,
            dalam_hal: Array.isArray(r.dalam_hal) ? r.dalam_hal : [],
        }));
        return NextResponse.json(data, { headers: noCache });
    } catch (e) {
        console.error("[korelasi-jabatan][GET]", e);
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
        const { jabatan_terkait, unit_kerja_instansi = "", dalam_hal } = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO korelasi_jabatan
         (id_jabatan, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at)
       VALUES ($1,$2,$3,$4, NOW(), NOW())
       RETURNING id_korelasi, id_jabatan, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at`,
            [id, jabatan_terkait, unit_kerja_instansi, dalam_hal]
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok: true, data: ins.rows[0] });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[korelasi-jabatan][POST]", e);
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
        await client.query(`DELETE FROM korelasi_jabatan WHERE id_jabatan=$1`, [id]);
        for (const it of p.data) {
            await client.query(
                `INSERT INTO korelasi_jabatan
           (id_jabatan, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at)
         VALUES ($1,$2,$3,$4, NOW(), NOW())`,
                [id, it.jabatan_terkait, it.unit_kerja_instansi ?? "", it.dalam_hal ?? []]
            );
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[korelasi-jabatan][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

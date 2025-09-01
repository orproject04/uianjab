import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";

/** ========= Zod helpers: coerce number/int/nullable ========= */
const zIntNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseInt(v, 10) : v),
    z.number().int().nullable()
);
const zNumNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseFloat(v) : v),
    z.number().nullable()
);

/** ========= Schemas ========= */
const ItemSchema = z.object({
    nomor_tugas: zIntNullable.optional(),
    uraian_tugas: z.string().default(""),
    hasil_kerja: z.array(z.string()).default([]),
    jumlah_hasil: zIntNullable.optional(),
    waktu_penyelesaian_jam: zIntNullable.optional(),
    waktu_efektif: zIntNullable.optional(),
    kebutuhan_pegawai: zNumNullable.optional(),
    tahapan: z.array(z.string()).default([]),
});
const ReplaceAllSchema = z.array(ItemSchema);

/** ========= Normalizer helper ========= */
const toNum = (v: any): number | null => (v == null ? null : Number(v));
const normalizeRow = (r: any, tahapan: string[] = []) => ({
    id_tugas: r.id_tugas,
    id_jabatan: r.id_jabatan,
    nomor_tugas: toNum(r.nomor_tugas),
    uraian_tugas: r.uraian_tugas ?? "",
    hasil_kerja: Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [],
    jumlah_hasil: toNum(r.jumlah_hasil),
    waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
    waktu_efektif: toNum(r.waktu_efektif),
    kebutuhan_pegawai: toNum(r.kebutuhan_pegawai),
    tahapan,
});

/** ========= Load list (join tahapan) ========= */
async function loadList(id: string) {
    const { rows } = await pool.query(
        `SELECT id_tugas, id_jabatan, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai
         FROM tugas_pokok
         WHERE id_jabatan=$1
         ORDER BY COALESCE(nomor_tugas, 2147483647), id_tugas`,
        [id]
    );

    if (!rows.length) return [];

    const ids = rows.map((r: any) => r.id_tugas);
    const tah = await pool.query(
        `SELECT id_tugas, tahapan
         FROM tahapan_uraian_tugas
         WHERE id_tugas = ANY($1)
         ORDER BY id_tahapan`,
        [ids]
    );

    const map = new Map<number, string[]>();
    tah.rows.forEach((t: any) => {
        const arr = map.get(t.id_tugas) ?? [];
        arr.push(t.tahapan ?? "");
        map.set(t.id_tugas, arr);
    });

    return rows.map((r: any) => normalizeRow(r, map.get(r.id_tugas) ?? []));
}

/** ========= Routes ========= */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        const data = await loadList(id);
        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (e) {
        console.error("[tugas-pokok][GET]", e);
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

        const {
            nomor_tugas = null,
            uraian_tugas = "",
            hasil_kerja = [],
            jumlah_hasil = null,
            waktu_penyelesaian_jam = null,
            waktu_efektif = null,
            kebutuhan_pegawai = null,
            tahapan = [],
        } = p.data;

        await client.query("BEGIN");
        const ins = await client.query(
            `INSERT INTO tugas_pokok
             (id_jabatan, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
              waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())
                 RETURNING id_tugas, id_jabatan, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                 waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai`,
            [id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai]
        );

        const newId = ins.rows[0].id_tugas;
        for (const t of tahapan) {
            await client.query(
                `INSERT INTO tahapan_uraian_tugas (id_tugas, id_jabatan, tahapan, created_at, updated_at)
                 VALUES ($1,$2,$3,NOW(),NOW())`,
                [newId, id, t]
            );
        }
        await client.query("COMMIT");

        const normalized = normalizeRow(ins.rows[0], tahapan);
        return NextResponse.json({ ok: true, data: normalized });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[tugas-pokok][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

// (Opsional) replace-all
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
        const old = await client.query(`SELECT id_tugas FROM tugas_pokok WHERE id_jabatan=$1`, [id]);
        const oldIds = old.rows.map((r: any) => r.id_tugas);
        if (oldIds.length) {
            await client.query(`DELETE FROM tahapan_uraian_tugas WHERE id_tugas = ANY($1)`, [oldIds]);
            await client.query(`DELETE FROM tugas_pokok WHERE id_jabatan=$1`, [id]);
        }

        for (const it of p.data) {
            const ins = await client.query(
                `INSERT INTO tugas_pokok
                 (id_jabatan, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                  waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())
                     RETURNING id_tugas`,
                [
                    id,
                    it.nomor_tugas ?? null,
                    it.uraian_tugas ?? "",
                    it.hasil_kerja ?? [],
                    it.jumlah_hasil ?? null,
                    it.waktu_penyelesaian_jam ?? null,
                    it.waktu_efektif ?? null,
                    it.kebutuhan_pegawai ?? null,
                ]
            );
            const newId = ins.rows[0].id_tugas;
            for (const t of it.tahapan ?? []) {
                await client.query(
                    `INSERT INTO tahapan_uraian_tugas (id_tugas, id_jabatan, tahapan, created_at, updated_at)
                     VALUES ($1,$2,$3,NOW(),NOW())`,
                    [newId, id, t]
                );
            }
        }
        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[tugas-pokok][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

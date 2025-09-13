import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

/** ========= Zod helpers ========= */
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

/** ========= Normalizer untuk response (tanpa alias kolom) ========= */
const toNum = (v: any): number | null => (v == null ? null : Number(v));
const normalizeRow = (r: any, tahapan: string[] = []) => ({
    id: r.id,                              // UUID dari tugas_pokok.id
    jabatan_id: r.jabatan_id,              // UUID dari tugas_pokok.jabatan_id
    nomor_tugas: toNum(r.nomor_tugas),
    uraian_tugas: r.uraian_tugas ?? "",
    hasil_kerja: Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [],
    jumlah_hasil: toNum(r.jumlah_hasil),
    waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
    waktu_efektif: toNum(r.waktu_efektif),
    kebutuhan_pegawai: r.kebutuhan_pegawai == null ? null : Number(r.kebutuhan_pegawai),
    tahapan,                               // properti tambahan (bukan kolom, hasil join)
});

/** ========= Load list (join tahapan) ========= */
async function loadList(jabatanId: string) {
    const { rows } = await pool.query(
        `SELECT
             id,
             jabatan_id,
             nomor_tugas,
             uraian_tugas,
             hasil_kerja,
             jumlah_hasil,
             waktu_penyelesaian_jam,
             waktu_efektif,
             kebutuhan_pegawai
         FROM tugas_pokok
         WHERE jabatan_id = $1
         ORDER BY COALESCE(nomor_tugas, 2147483647), created_at, id`,
        [jabatanId]
    );

    if (!rows.length) return [];

    const tugasIds: string[] = rows.map((r: any) => r.id);
    const tah = await pool.query(
        `SELECT tugas_id, tahapan
         FROM tahapan_uraian_tugas
         WHERE tugas_id = ANY ($1)
         ORDER BY created_at, id`,
        [tugasIds]
    );

    const map = new Map<string, string[]>();
    for (const t of tah.rows) {
        const arr = map.get(t.tugas_id) ?? [];
        arr.push(t.tahapan ?? "");
        map.set(t.tugas_id, arr);
    }

    return rows.map((r: any) => normalizeRow(r, map.get(r.id) ?? []));
}

/** ========= Routes ========= */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { id } = await ctx.params; // jabatan_id (UUID)
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
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await ctx.params; // jabatan_id
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
             (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
              waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                 RETURNING
         id,
         jabatan_id,
         nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
         waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai`,
            [id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai]
        );

        const newId: string = ins.rows[0].id;

        // isi tahapan (jika ada)
        for (const t of tahapan) {
            await client.query(
                `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                [newId, id, t]
            );
        }

        await client.query("COMMIT");

        // balas apa adanya (tanpa alias) + tambahkan properti tahapan
        return NextResponse.json({ ok: true, data: normalizeRow(ins.rows[0], tahapan) });
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
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await ctx.params; // jabatan_id
        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        await client.query("BEGIN");

        // hapus lama
        const old = await client.query(
            `SELECT id FROM tugas_pokok WHERE jabatan_id = $1`,
            [id]
        );
        const oldIds: string[] = old.rows.map((r: any) => r.id);

        if (oldIds.length) {
            await client.query(
                `DELETE FROM tahapan_uraian_tugas WHERE tugas_id = ANY ($1)`,
                [oldIds]
            );
            await client.query(
                `DELETE FROM tugas_pokok WHERE jabatan_id = $1`,
                [id]
            );
        }

        // insert baru
        for (const it of p.data) {
            const ins = await client.query(
                `INSERT INTO tugas_pokok
                 (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                  waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                     RETURNING id`,
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
            const newId = ins.rows[0].id as string;
            for (const t of it.tahapan ?? []) {
                await client.query(
                    `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                     VALUES ($1, $2, $3, NOW(), NOW())`,
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

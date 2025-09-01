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
const PatchSchema = z.object({
    nomor_tugas: zIntNullable.optional(),
    uraian_tugas: z.string().optional(),
    hasil_kerja: z.array(z.string()).optional(),
    jumlah_hasil: zIntNullable.optional(),
    waktu_penyelesaian_jam: zIntNullable.optional(),
    waktu_efektif: zIntNullable.optional(),
    kebutuhan_pegawai: zNumNullable.optional(),
    tahapan: z.array(z.string()).optional(), // replace-all tahapan bila dikirim
});

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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_tugas: string }> }) {
    const client = await pool.connect();
    try {
        const { id, id_tugas } = await ctx.params;
        const tid = Number(id_tugas);

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        const fields: string[] = [];
        const values: any[] = [];

        if (p.data.nomor_tugas !== undefined) { fields.push(`nomor_tugas=$${fields.length + 1}`); values.push(p.data.nomor_tugas); }
        if (p.data.uraian_tugas !== undefined) { fields.push(`uraian_tugas=$${fields.length + 1}`); values.push(p.data.uraian_tugas); }
        if (p.data.hasil_kerja !== undefined)   { fields.push(`hasil_kerja=$${fields.length + 1}`); values.push(p.data.hasil_kerja); }
        if (p.data.jumlah_hasil !== undefined)  { fields.push(`jumlah_hasil=$${fields.length + 1}`); values.push(p.data.jumlah_hasil); }
        if (p.data.waktu_penyelesaian_jam !== undefined) { fields.push(`waktu_penyelesaian_jam=$${fields.length + 1}`); values.push(p.data.waktu_penyelesaian_jam); }
        if (p.data.waktu_efektif !== undefined) { fields.push(`waktu_efektif=$${fields.length + 1}`); values.push(p.data.waktu_efektif); }
        if (p.data.kebutuhan_pegawai !== undefined) { fields.push(`kebutuhan_pegawai=$${fields.length + 1}`); values.push(p.data.kebutuhan_pegawai); }

        await client.query("BEGIN");
        if (fields.length) {
            values.push(id, tid);
            const q = `UPDATE tugas_pokok SET ${fields.join(", ")}, updated_at=NOW()
                       WHERE id_jabatan=$${fields.length + 1} AND id_tugas=$${fields.length + 2}`;
            const up = await client.query(q, values);
            if (!up.rowCount) {
                await client.query("ROLLBACK");
                return NextResponse.json({ error: "Not Found" }, { status: 404 });
            }
        }

        if (p.data.tahapan) {
            await client.query(`DELETE FROM tahapan_uraian_tugas WHERE id_tugas=$1`, [tid]);
            for (const t of p.data.tahapan) {
                await client.query(
                    `INSERT INTO tahapan_uraian_tugas (id_tugas, id_jabatan, tahapan, created_at, updated_at)
                     VALUES ($1,$2,$3,NOW(),NOW())`,
                    [tid, id, t]
                );
            }
        }

        await client.query("COMMIT");

        // reload & normalize
        const row = await client.query(
            `SELECT id_tugas, id_jabatan, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                    waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai
             FROM tugas_pokok
             WHERE id_jabatan=$1 AND id_tugas=$2
                 LIMIT 1`,
            [id, tid]
        );
        if (!row.rows.length) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }

        const tah = await client.query(
            `SELECT tahapan FROM tahapan_uraian_tugas WHERE id_tugas=$1 ORDER BY id_tahapan`,
            [tid]
        );
        const tahapan = tah.rows.map((r: any) => r.tahapan ?? "");

        return NextResponse.json({ ok: true, data: normalizeRow(row.rows[0], tahapan) });
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[tugas-pokok][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; id_tugas: string }> }) {
    try {
        const { id, id_tugas } = await ctx.params;
        const tid = Number(id_tugas);
        const del = await pool.query(
            `DELETE FROM tugas_pokok WHERE id_jabatan=$1 AND id_tugas=$2`,
            [id, tid]
        );
        if (!del.rowCount) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }
        // tahapan_uraian_tugas akan terhapus jika ada FK CASCADE; jika tidak, hapus manual di sini.
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[tugas-pokok][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

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

const toNum = (v: any): number | null => (v == null ? null : Number(v));
const normalizeRow = (r: any, tahapan: string[] = []) => ({
    id: r.id,                       // tugas_pokok.id (UUID)
    jabatan_id: r.jabatan_id,       // tugas_pokok.jabatan_id (UUID)
    nomor_tugas: toNum(r.nomor_tugas),
    uraian_tugas: r.uraian_tugas ?? "",
    hasil_kerja: Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [],
    jumlah_hasil: toNum(r.jumlah_hasil),
    waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
    waktu_efektif: toNum(r.waktu_efektif),
    kebutuhan_pegawai: r.kebutuhan_pegawai == null ? null : Number(r.kebutuhan_pegawai),
    tahapan,                        // properti tambahan (bukan kolom)
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; id_tugas: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id, id_tugas } = await ctx.params; // id = jabatan_id (UUID), id_tugas = tugas_pokok.id (UUID)

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        const fields: string[] = [];
        const values: any[] = [];
        if (p.data.nomor_tugas !== undefined) { fields.push(`nomor_tugas=$${fields.length + 1}`); values.push(p.data.nomor_tugas); }
        if (p.data.uraian_tugas !== undefined) { fields.push(`uraian_tugas=$${fields.length + 1}`); values.push(p.data.uraian_tugas); }
        if (p.data.hasil_kerja !== undefined) { fields.push(`hasil_kerja=$${fields.length + 1}`); values.push(p.data.hasil_kerja); }
        if (p.data.jumlah_hasil !== undefined) { fields.push(`jumlah_hasil=$${fields.length + 1}`); values.push(p.data.jumlah_hasil); }
        if (p.data.waktu_penyelesaian_jam !== undefined) { fields.push(`waktu_penyelesaian_jam=$${fields.length + 1}`); values.push(p.data.waktu_penyelesaian_jam); }
        if (p.data.waktu_efektif !== undefined) { fields.push(`waktu_efektif=$${fields.length + 1}`); values.push(p.data.waktu_efektif); }
        if (p.data.kebutuhan_pegawai !== undefined) { fields.push(`kebutuhan_pegawai=$${fields.length + 1}`); values.push(p.data.kebutuhan_pegawai); }

        await client.query("BEGIN");

        if (fields.length) {
            values.push(id, id_tugas);
            const q = `UPDATE tugas_pokok
                       SET ${fields.join(", ")}, updated_at=NOW()
                       WHERE jabatan_id = $${fields.length + 1}
                         AND id = $${fields.length + 2}`;
            const up = await client.query(q, values);
            if (!up.rowCount) {
                await client.query("ROLLBACK");
                return NextResponse.json({ error: "Not Found" }, { status: 404 });
            }
        }

        if (p.data.tahapan) {
            await client.query(`DELETE FROM tahapan_uraian_tugas WHERE tugas_id = $1`, [id_tugas]);
            for (const t of p.data.tahapan) {
                await client.query(
                    `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                     VALUES ($1, $2, $3, NOW(), NOW())`,
                    [id_tugas, id, t]
                );
            }
        }

        await client.query("COMMIT");

        // reload baris apa adanya (tanpa alias) + sertakan tahapan
        const row = await pool.query(
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
             WHERE jabatan_id = $1 AND id = $2
                 LIMIT 1`,
            [id, id_tugas]
        );
        if (!row.rows.length) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }

        const tah = await pool.query(
            `SELECT tahapan
             FROM tahapan_uraian_tugas
             WHERE tugas_id = $1
             ORDER BY created_at, id`,
            [id_tugas]
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
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id, id_tugas } = await ctx.params; // id = jabatan_id, id_tugas = tugas_pokok.id

        const del = await pool.query(
            `DELETE FROM tugas_pokok
             WHERE jabatan_id = $1 AND id = $2`,
            [id, id_tugas]
        );

        if (!del.rowCount) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }

        // Jika FK CASCADE belum ada pada tahapan_uraian_tugas, aktifkan ini:
        // await pool.query(`DELETE FROM tahapan_uraian_tugas WHERE tugas_id = $1`, [id_tugas]);

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[tugas-pokok][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

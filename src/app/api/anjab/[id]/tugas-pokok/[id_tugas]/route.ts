import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

/** ======= Helpers ======= */
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

const toNum = (v: any): number | null => (v == null ? null : Number(v));
const normalizeRow = (r: any) => ({
    id: Number(r.id), // INT
    jabatan_id: r.jabatan_id, // UUID
    nomor_tugas: toNum(r.nomor_tugas),
    uraian_tugas: r.uraian_tugas ?? "",
    hasil_kerja: Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [],
    jumlah_hasil: toNum(r.jumlah_hasil),
    waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
    waktu_efektif: toNum(r.waktu_efektif),
    kebutuhan_pegawai: r.kebutuhan_pegawai == null ? null : Number(r.kebutuhan_pegawai),
    tahapan: Array.isArray(r.tahapan) ? r.tahapan : [],
});

/** ======= Zod helpers ======= */
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
    // kebutuhan_pegawai dari user diabaikan → jangan dipakai
    kebutuhan_pegawai: zNumNullable.optional(),
    tahapan: z.array(z.string()).optional(), // replace-all tahapan jika dikirim
});

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string; id_tugas: string }> }
) {
    const client = await pool.connect();
    let began = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id, id_tugas} = await ctx.params; // UUID, INT
        if (!isUuid(id) || !isIntId(id_tugas)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_tugas harus angka"}, {status: 400});
        }
        const tugasId = Number(id_tugas);

        // ✅ pastikan jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const fields: string[] = [];
        const values: any[] = [];
        const push = (col: string, val: any) => {
            fields.push(`${col}=$${fields.length + 1}`);
            values.push(val);
        };

        if (p.data.nomor_tugas !== undefined) push("nomor_tugas", p.data.nomor_tugas);
        if (p.data.uraian_tugas !== undefined) push("uraian_tugas", p.data.uraian_tugas);
        if (p.data.hasil_kerja !== undefined) push("hasil_kerja", p.data.hasil_kerja);
        if (p.data.jumlah_hasil !== undefined) push("jumlah_hasil", p.data.jumlah_hasil);
        if (p.data.waktu_penyelesaian_jam !== undefined) push("waktu_penyelesaian_jam", p.data.waktu_penyelesaian_jam);
        if (p.data.waktu_efektif !== undefined) push("waktu_efektif", p.data.waktu_efektif);
        // NOTE: kebutuhan_pegawai dari user diabaikan → tidak dipush

        await client.query("BEGIN");
        began = true;

        if (fields.length) {
            values.push(id, tugasId);
            const q = `UPDATE tugas_pokok
                       SET ${fields.join(", ")},
                           updated_at=NOW()
                       WHERE jabatan_id = $${fields.length + 1}::uuid
                   AND id = $${fields.length + 2}::int`;
            const up = await client.query(q, values);
            if (!up.rowCount) {
                await client.query("ROLLBACK");
                began = false;
                return NextResponse.json({error: "Not Found, (Tugas Pokok tidak ditemukan)"}, {status: 404});
            }
        }

        if (p.data.tahapan) {
            await client.query(`DELETE
                                FROM tahapan_uraian_tugas
                                WHERE tugas_id = $1::int`, [tugasId]);
            for (const t of p.data.tahapan) {
                await client.query(
                    `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                     VALUES ($1::int, $2::uuid, $3, NOW(), NOW())`,
                    [tugasId, id, t]
                );
            }
        }

        // ✅ Recompute kebutuhan_pegawai raw (tanpa pembulatan) untuk baris ini
        await client.query(
            `UPDATE tugas_pokok
             SET kebutuhan_pegawai = CASE
                                         WHEN COALESCE(waktu_efektif,0) > 0
                                             THEN (COALESCE(jumlah_hasil,0)::numeric * COALESCE(waktu_penyelesaian_jam,0)::numeric)
                                             / waktu_efektif::numeric
                                       ELSE NULL
            END,
                 updated_at = NOW()
             WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, tugasId]
        );

        // ✅ Update kebutuhan_pegawai di struktur_organisasi (dibulatkan ke atas)
        await client.query(
            `UPDATE struktur_organisasi so
             SET kebutuhan_pegawai = COALESCE(
                     (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric,0))
                      FROM tugas_pokok tp
                      WHERE tp.jabatan_id = $1::uuid), 0),
                 updated_at = NOW()
             WHERE so.id = (SELECT struktur_id FROM jabatan WHERE id = $1::uuid)`,
            [id]
        );

        await client.query("COMMIT");
        began = false;

        // Reload satu baris pakai JOIN + json_agg
        const {rows} = await pool.query(
            `
                SELECT t.id,
                       t.jabatan_id,
                       t.nomor_tugas,
                       t.uraian_tugas,
                       t.hasil_kerja,
                       t.jumlah_hasil,
                       t.waktu_penyelesaian_jam,
                       t.waktu_efektif,
                       t.kebutuhan_pegawai,
                       COALESCE(
                               json_agg(u.tahapan ORDER BY u.created_at, u.id)
                               FILTER(WHERE u.tugas_id IS NOT NULL),
                               '[]'
                       ) AS tahapan
                FROM tugas_pokok t
                         LEFT JOIN tahapan_uraian_tugas u ON u.tugas_id = t.id
                WHERE t.jabatan_id = $1::uuid AND t.id = $2::int
                GROUP BY
                    t.id, t.jabatan_id, t.nomor_tugas, t.uraian_tugas, t.hasil_kerja,
                    t.jumlah_hasil, t.waktu_penyelesaian_jam, t.waktu_efektif, t.kebutuhan_pegawai
            `,
            [id, tugasId]
        );
        if (!rows.length) {
            return NextResponse.json({error: "Not Found, (Tugas Pokok tidak ditemukan)"}, {status: 404});
        }

        return NextResponse.json({ok: true, data: normalizeRow(rows[0])});
    } catch (e: any) {
        if (began) {
            try {
                await client.query("ROLLBACK");
            } catch {
            }
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id / tugas_id tidak ditemukan"}, {status: 400});
        }
        console.error("[tugas-pokok][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; id_tugas: string }> }
) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id, id_tugas} = await ctx.params; // UUID, INT
        if (!isUuid(id) || !isIntId(id_tugas)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_tugas harus angka"}, {status: 400});
        }
        const tugasId = Number(id_tugas);

        // ✅ pastikan jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const del = await pool.query(
            `DELETE
             FROM tugas_pokok
             WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, tugasId]
        );

        if (!del.rowCount) {
            return NextResponse.json({error: "Not Found, (Tugas Pokok tidak ditemukan)"}, {status: 404});
        }

        // tahapan_uraian_tugas.tugas_id ON DELETE CASCADE → tahapan ikut terhapus

        // ✅ Setelah delete, update agregat struktur_organisasi (CEIL SUM)
        await pool.query(
            `UPDATE struktur_organisasi so
             SET kebutuhan_pegawai = COALESCE(
                     (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric,0))
                      FROM tugas_pokok tp
                      WHERE tp.jabatan_id = $1::uuid), 0),
                 updated_at = NOW()
             WHERE so.id = (SELECT struktur_id FROM jabatan WHERE id = $1::uuid)`,
            [id]
        );

        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error("[tugas-pokok][DELETE]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

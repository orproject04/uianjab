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

/** ======= Zod helpers ======= */
const zIntNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseInt(v, 10) : v),
    z.number().int().nullable()
);
const zNumNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseFloat(v) : v),
    z.number().nullable()
);

const TahapanDetailSchema = z.object({
    nomor_tahapan: zIntNullable.optional(),
    tahapan: z.string().default(""),
    detail_tahapan: z.array(z.string()).default([]),
});

const PatchSchema = z.object({
    nomor_tugas: zIntNullable.optional(),
    uraian_tugas: z.string().optional(),
    hasil_kerja: z.array(z.string()).optional(),
    jumlah_hasil: zIntNullable.optional(),
    waktu_penyelesaian_jam: zIntNullable.optional(),
    waktu_efektif: zIntNullable.optional(),
    kebutuhan_pegawai: zNumNullable.optional(), // diabaikan

    detail_uraian_tugas: z.array(TahapanDetailSchema).optional(), // replace-all nested

    // kompat lama
    tahapan: z.array(z.string()).optional(),
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

        const {id, id_tugas} = await ctx.params;
        if (!isUuid(id) || !isIntId(id_tugas)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_tugas harus angka"}, {status: 400});
        }
        const tugasId = Number(id_tugas);

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
        if (p.data.waktu_penyelesaian_jam !== undefined)
            push("waktu_penyelesaian_jam", p.data.waktu_penyelesaian_jam);
        if (p.data.waktu_efektif !== undefined) push("waktu_efektif", p.data.waktu_efektif);

        await client.query("BEGIN");
        began = true;

        if (fields.length) {
            values.push(id, tugasId);
            const q = `UPDATE tugas_pokok
                       SET ${fields.join(", ")},
                           updated_at = NOW()
                       WHERE jabatan_id = $${fields.length + 1}::uuid
                   AND id = $${fields.length + 2}:: int`;
            const up = await client.query(q, values);
            if (!up.rowCount) {
                await client.query("ROLLBACK");
                began = false;
                return NextResponse.json({error: "Not Found, (Tugas Pokok tidak ditemukan)"}, {status: 404});
            }
        }

        // Replace-all nested jika dikirim (atau kompat lama via tahapan[])
        let nestedPatch = p.data.detail_uraian_tugas;
        if ((!nestedPatch || !nestedPatch.length) && Array.isArray(p.data.tahapan)) {
            nestedPatch = p.data.tahapan.map((t, i) => ({
                nomor_tahapan: i + 1,
                tahapan: t,
                detail_tahapan: [],
            }));
        }

        if (nestedPatch) {
            await client.query(
                `DELETE
                 FROM tahapan_uraian_tugas
                 WHERE tugas_id = $1::int`,
                [tugasId]
            );

            for (let i = 0; i < nestedPatch.length; i++) {
                const td = nestedPatch[i];
                const nomorTah = td.nomor_tahapan ?? i + 1;

                const insTah = await client.query(
                    `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, nomor_tahapan, created_at, updated_at)
                     VALUES ($1::int, $2::uuid, $3, $4, NOW(), NOW()) RETURNING id`,
                    [tugasId, id, td.tahapan ?? "", nomorTah]
                );
                const tahapanId = Number(insTah.rows[0].id);

                if (Array.isArray(td.detail_tahapan) && td.detail_tahapan.length) {
                    for (const det of td.detail_tahapan) {
                        await client.query(
                            `INSERT INTO detail_tahapan_uraian_tugas (tahapan_id, jabatan_id, detail, created_at, updated_at)
                             VALUES ($1::int, $2::uuid, $3, NOW(), NOW())`,
                            [tahapanId, id, det]
                        );
                    }
                }
            }
        }

        // Recompute kebutuhan_pegawai raw untuk baris ini
        await client.query(
            `UPDATE tugas_pokok
             SET kebutuhan_pegawai =
                     CASE WHEN COALESCE(waktu_efektif, 0) > 0
                              THEN (COALESCE(jumlah_hasil, 0)::numeric * COALESCE(waktu_penyelesaian_jam, 0)::numeric) / waktu_efektif::numeric
          ELSE NULL
            END,
     updated_at = NOW()
   WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, tugasId]
        );

        // Update agregat peta_jabatan
        await client.query(
            `UPDATE peta_jabatan so
             SET kebutuhan_pegawai = COALESCE(
                     (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric, 0))
                      FROM tugas_pokok tp
                      WHERE tp.jabatan_id = $1 ::uuid), 0),
                 updated_at        = NOW()
             WHERE so.id = (SELECT peta_id FROM jabatan WHERE id = $1::uuid)`,
            [id]
        );

        await client.query("COMMIT");
        began = false;

        // Reload satu baris
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
                               (SELECT json_agg(j.x ORDER BY j._ord_nomor NULLS LAST, j._created_at, j._id)
                                FROM (SELECT u.id                         AS _id,
                                             u.created_at                 AS _created_at,
                                             COALESCE(u.nomor_tahapan, 0) AS _ord_nomor,
                                             json_build_object(
                                                     'nomor_tahapan', u.nomor_tahapan,
                                                     'tahapan', u.tahapan,
                                                     'detail_tahapan',
                                                     COALESCE(
                                                             (SELECT json_agg(d.detail ORDER BY d.created_at, d.id)
                                                              FROM detail_tahapan_uraian_tugas d
                                                              WHERE d.tahapan_id = u.id),
                                                             '[]'
                                                     )
                                             )                            AS x
                                      FROM tahapan_uraian_tugas u
                                      WHERE u.tugas_id = t.id
                                      ORDER BY u.nomor_tahapan NULLS LAST, u.created_at, u.id) j),
                               '[]'
                       ) AS detail_uraian_tugas
                FROM tugas_pokok t
                WHERE t.jabatan_id = $1::uuid AND t.id = $2:: int
            `,
            [id, tugasId]
        );
        if (!rows.length) {
            return NextResponse.json({error: "Not Found, (Tugas Pokok tidak ditemukan)"}, {status: 404});
        }

        const row = rows[0];
        const data = {
            id: Number(row.id),
            jabatan_id: row.jabatan_id,
            nomor_tugas: toNum(row.nomor_tugas),
            uraian_tugas: row.uraian_tugas ?? "",
            hasil_kerja: Array.isArray(row.hasil_kerja) ? row.hasil_kerja : [],
            jumlah_hasil: toNum(row.jumlah_hasil),
            waktu_penyelesaian_jam: toNum(row.waktu_penyelesaian_jam),
            waktu_efektif: toNum(row.waktu_efektif),
            kebutuhan_pegawai: row.kebutuhan_pegawai == null ? null : Number(row.kebutuhan_pegawai),
            detail_uraian_tugas: Array.isArray(row.detail_uraian_tugas) ? row.detail_uraian_tugas : [],
        };

        return NextResponse.json({ok: true, data});
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
        if (e?.code === "23505") {
            return NextResponse.json({error: "Duplikasi nomor_tahapan pada satu tugas"}, {status: 400});
        }
        console.error("[tugas-pokok][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        try {
            (client as any).release?.();
        } catch {
        }
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

        const {id, id_tugas} = await ctx.params;
        if (!isUuid(id) || !isIntId(id_tugas)) {
            return NextResponse.json({error: "Invalid, id harus UUID, id_tugas harus angka"}, {status: 400});
        }
        const tugasId = Number(id_tugas);

        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const del = await pool.query(
            `DELETE
             FROM tugas_pokok
             WHERE jabatan_id = $1::uuid AND id = $2:: int`,
            [id, tugasId]
        );
        if (!del.rowCount) {
            return NextResponse.json({error: "Not Found, (Tugas Pokok tidak ditemukan)"}, {status: 404});
        }

        await pool.query(
            `UPDATE peta_jabatan so
             SET kebutuhan_pegawai = COALESCE(
                     (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric, 0))
                      FROM tugas_pokok tp
                      WHERE tp.jabatan_id = $1 ::uuid), 0),
                 updated_at        = NOW()
             WHERE so.id = (SELECT peta_id FROM jabatan WHERE id = $1::uuid)`,
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

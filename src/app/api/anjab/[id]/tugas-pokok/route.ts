import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

/** ======= Helpers ======= */
const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

/** ======= Zod helpers ======= */
const zIntNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseInt(v, 10) : v),
    z.number().int().nullable()
);
const zNumNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseFloat(v) : v),
    z.number().nullable()
);

/** ======= Schemas (baru, nested) ======= */
const TahapanDetailSchema = z.object({
    nomor_tahapan: zIntNullable.optional(),
    tahapan: z.string().default(""),
    detail_tahapan: z.array(z.string()).default([]),
});

const ItemSchema = z.object({
    nomor_tugas: zIntNullable.optional(),
    uraian_tugas: z.string().default(""),
    hasil_kerja: z.array(z.string()).default([]),
    jumlah_hasil: zIntNullable.optional(),
    waktu_penyelesaian_jam: zIntNullable.optional(),
    waktu_efektif: zIntNullable.optional(),
    kebutuhan_pegawai: zNumNullable.optional(), // diabaikan (auto DB)
    detail_uraian_tugas: z.array(TahapanDetailSchema).default([]),

    // kompat lama
    tahapan: z.array(z.string()).optional(),
});
const ReplaceAllSchema = z.array(ItemSchema);

/** ======= Normalizer (output) ======= */
const toNum = (v: any): number | null => (v == null ? null : Number(v));

/** Query helper: load list with nested json_agg */
async function loadList(jabatanId: string) {
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
            WHERE t.jabatan_id = $1::uuid
            ORDER BY COALESCE (t.nomor_tugas, 2147483647), t.created_at, t.id
        `,
        [jabatanId]
    );

    return rows.map((r: any) => ({
        id: Number(r.id),
        jabatan_id: r.jabatan_id,
        nomor_tugas: toNum(r.nomor_tugas),
        uraian_tugas: r.uraian_tugas ?? "",
        hasil_kerja: Array.isArray(r.hasil_kerja) ? r.hasil_kerja : [],
        jumlah_hasil: toNum(r.jumlah_hasil),
        waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
        waktu_efektif: toNum(r.waktu_efektif),
        kebutuhan_pegawai: r.kebutuhan_pegawai == null ? null : Number(r.kebutuhan_pegawai),
        detail_uraian_tugas: Array.isArray(r.detail_uraian_tugas) ? r.detail_uraian_tugas : [],
    }));
}

/** ======= Routes ======= */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});

        const {id} = await ctx.params; // jabatan_id
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }

        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const data = await loadList(id);
        return NextResponse.json(data, {headers: noCache});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error("[tugas-pokok][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    let began = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }
        const {id} = await ctx.params; // jabatan_id
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const p = ItemSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const {
            nomor_tugas = null,
            uraian_tugas = "",
            hasil_kerja = [],
            jumlah_hasil = null,
            waktu_penyelesaian_jam = null,
            waktu_efektif = null,
            detail_uraian_tugas = [],
            tahapan = undefined,
        } = p.data;

        const nested =
            detail_uraian_tugas && detail_uraian_tugas.length
                ? detail_uraian_tugas
                : Array.isArray(tahapan)
                    ? tahapan.map((t, i) => ({nomor_tahapan: i + 1, tahapan: t, detail_tahapan: []}))
                    : [];

        await client.query("BEGIN");
        began = true;

        const ins = await client.query(
            `INSERT INTO tugas_pokok
             (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
              waktu_penyelesaian_jam, waktu_efektif, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id`,
            [id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif]
        );
        const newId: number = Number(ins.rows[0].id);

        // Insert tahapan + detail
        for (let i = 0; i < nested.length; i++) {
            const td = nested[i];
            const nomorTah = td.nomor_tahapan ?? i + 1;
            const u = await client.query(
                `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, nomor_tahapan, created_at, updated_at)
                 VALUES ($1::int, $2::uuid, $3, $4, NOW(), NOW()) RETURNING id`,
                [newId, id, td.tahapan ?? "", nomorTah]
            );
            const tahapanId: number = Number(u.rows[0].id);
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

        // Recompute kebutuhan_pegawai (raw)
        await client.query(
            `UPDATE tugas_pokok
             SET kebutuhan_pegawai =
                     CASE WHEN COALESCE(waktu_efektif, 0) > 0
                              THEN (COALESCE(jumlah_hasil, 0)::numeric * COALESCE(waktu_penyelesaian_jam, 0)::numeric) / waktu_efektif::numeric
          ELSE NULL
            END,
     updated_at = NOW()
   WHERE id = $1::int`,
            [newId]
        );

        // Update agregat peta_jabatan (CEIL SUM)
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
            [id, newId]
        );

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
                await pool.query("ROLLBACK");
            } catch {
            }
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan"}, {status: 400});
        }
        if (e?.code === "23505") {
            return NextResponse.json({error: "Duplikasi nomor_tahapan pada satu tugas"}, {status: 400});
        }
        console.error("[tugas-pokok][POST]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        try {
            (client as any).release?.();
        } catch {
        }
    }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    let began = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden, Anda tidak berhak mengakses fitur ini" }, { status: 403 });
        }

        const { id } = await ctx.params; // jabatan_id
        if (!isUuid(id)) {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }

        // ✅ pastikan jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({ error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" }, { status: 404 });
        }

        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        await client.query("BEGIN");
        began = true;

        // Hapus data lama (tahapan dulu → detail ikut terhapus via CASCADE), lalu tugas
        const old = await client.query(
            `SELECT id FROM tugas_pokok WHERE jabatan_id = $1::uuid`,
            [id]
        );
        const oldIds: number[] = old.rows
            .map((r: any) => Number(r.id))
            .filter((n: number) => Number.isInteger(n));

        if (oldIds.length) {
            await client.query(
                `DELETE FROM tahapan_uraian_tugas WHERE tugas_id = ANY ($1::int[])`,
                [oldIds]
            );
            await client.query(
                `DELETE FROM tugas_pokok WHERE jabatan_id = $1::uuid`,
                [id]
            );
        }

        // Insert baru (tanpa kebutuhan_pegawai), lalu hitung ulang per baris
        for (const it of p.data) {
            const ins = await client.query(
                `INSERT INTO tugas_pokok
                 (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                  waktu_penyelesaian_jam, waktu_efektif, created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                     RETURNING id`,
                [
                    id,
                    it.nomor_tugas ?? null,
                    it.uraian_tugas ?? "",
                    it.hasil_kerja ?? [],
                    it.jumlah_hasil ?? null,
                    it.waktu_penyelesaian_jam ?? null,
                    it.waktu_efektif ?? null,
                ]
            );
            const newId: number = Number(ins.rows[0].id);

            // Nested baru ATAU kompat lama (tahapan: string[])
            const nested = (it.detail_uraian_tugas && it.detail_uraian_tugas.length)
                ? it.detail_uraian_tugas
                : (Array.isArray(it.tahapan)
                    ? it.tahapan.map((t, i) => ({
                        nomor_tahapan: i + 1,
                        tahapan: t,
                        detail_tahapan: [],
                    }))
                    : []);

            // Tulis tahapan + detail
            for (let i = 0; i < nested.length; i++) {
                const td = nested[i];
                const nomorTah = td.nomor_tahapan ?? (i + 1);

                const insTah = await client.query(
                    `INSERT INTO tahapan_uraian_tugas
                         (tugas_id, jabatan_id, tahapan, nomor_tahapan, created_at, updated_at)
                     VALUES ($1::int, $2::uuid, $3, $4, NOW(), NOW())
                         RETURNING id`,
                    [newId, id, td.tahapan ?? "", nomorTah]
                );
                const tahapanId = Number(insTah.rows[0].id);

                if (Array.isArray(td.detail_tahapan) && td.detail_tahapan.length) {
                    for (const det of td.detail_tahapan) {
                        await client.query(
                            `INSERT INTO detail_tahapan_uraian_tugas
                                 (tahapan_id, jabatan_id, detail, created_at, updated_at)
                             VALUES ($1::int, $2::uuid, $3, NOW(), NOW())`,
                            [tahapanId, id, det]
                        );
                    }
                }
            }

            // Recompute kebutuhan_pegawai (raw) untuk baris ini
            await client.query(
                `UPDATE tugas_pokok
                 SET kebutuhan_pegawai =
                         CASE WHEN COALESCE(waktu_efektif, 0) > 0
                                  THEN (COALESCE(jumlah_hasil, 0)::numeric * COALESCE(waktu_penyelesaian_jam, 0)::numeric) / waktu_efektif::numeric
                ELSE NULL
                END,
           updated_at = NOW()
         WHERE id = $1::int`,
                [newId]
            );
        }

        // Update kebutuhan_pegawai (dibulatkan ke atas) di peta_jabatan
        await client.query(
            `UPDATE peta_jabatan so
       SET kebutuhan_pegawai = COALESCE(
             (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric, 0))
              FROM tugas_pokok tp
              WHERE tp.jabatan_id = $1::uuid), 0),
           updated_at = NOW()
       WHERE so.id = (SELECT peta_id FROM jabatan WHERE id = $1::uuid)`,
            [id]
        );

        await client.query("COMMIT");
        began = false;

        // ✅ reload semua tugas_pokok setelah replace-all (pakai helper loadList)
        const data = await loadList(id);

        return NextResponse.json({ ok: true, data });
    } catch (e: any) {
        if (began) {
            try { await client.query("ROLLBACK"); } catch {}
        }
        if (e?.code === "22P02") {
            return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        }
        if (e?.code === "23503") {
            return NextResponse.json({ error: "jabatan_id tidak ditemukan" }, { status: 400 });
        }
        if (e?.code === "23505") {
            return NextResponse.json({ error: "Duplikasi nomor_tahapan pada satu tugas" }, { status: 400 });
        }
        console.error("[tugas-pokok][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        try { client.release(); } catch {}
    }
}

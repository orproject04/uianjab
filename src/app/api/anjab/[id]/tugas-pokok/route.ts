// src/app/api/anjab/[id]/tugas-pokok/route.ts
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

/** ======= Zod helpers ======= */
const zIntNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseInt(v, 10) : v),
    z.number().int().nullable()
);
const zNumNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseFloat(v) : v),
    z.number().nullable()
);

/** ======= Schemas ======= */
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

/** ======= Normalizer (output) ======= */
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

/** ======= Query helper: load list with JOIN + json_agg ======= */
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
                           json_agg(u.tahapan ORDER BY u.created_at, u.id)
                           FILTER(WHERE u.tugas_id IS NOT NULL),
                           '[]'
                   ) AS tahapan
            FROM tugas_pokok t
                     LEFT JOIN tahapan_uraian_tugas u ON u.tugas_id = t.id
            WHERE t.jabatan_id = $1::uuid
            GROUP BY
                t.id, t.jabatan_id, t.nomor_tugas, t.uraian_tugas, t.hasil_kerja,
                t.jumlah_hasil, t.waktu_penyelesaian_jam, t.waktu_efektif, t.kebutuhan_pegawai
            ORDER BY COALESCE (t.nomor_tugas, 2147483647), t.created_at, t.id
        `,
        [jabatanId]
    );

    return rows.map(normalizeRow);
}

/** ======= Routes ======= */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});

        const {id} = await ctx.params; // jabatan_id
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }

        const data = await loadList(id);
        return NextResponse.json(data, {headers: noCache});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
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
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params; // jabatan_id
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
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
            kebutuhan_pegawai = null,
            tahapan = [],
        } = p.data;

        await client.query("BEGIN");
        began = true;

        const ins = await client.query(
            `INSERT INTO tugas_pokok
             (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
              waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id`,
            [id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai]
        );

        const newId: number = Number(ins.rows[0].id);

        // Insert tahapan (jika ada)
        for (const t of tahapan) {
            await client.query(
                `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                 VALUES ($1::int, $2::uuid, $3, NOW(), NOW())`,
                [newId, id, t]
            );
        }

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
                WHERE t.jabatan_id = $1::uuid AND t.id = $2:: int
                GROUP BY
                    t.id, t.jabatan_id, t.nomor_tugas, t.uraian_tugas, t.hasil_kerja,
                    t.jumlah_hasil, t.waktu_penyelesaian_jam, t.waktu_efektif, t.kebutuhan_pegawai
            `,
            [id, newId]
        );

        return NextResponse.json({ok: true, data: normalizeRow(rows[0])});
    } catch (e: any) {
        if (began) {
            try {
                await client.query("ROLLBACK");
            } catch {
            }
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan (FK violation)"}, {status: 400});
        }
        console.error("[tugas-pokok][POST]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    let began = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params; // jabatan_id
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }

        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        await client.query("BEGIN");
        began = true;

        // Hapus lama
        const old = await client.query(
            `SELECT id
             FROM tugas_pokok
             WHERE jabatan_id = $1::uuid`,
            [id]
        );
        const oldIds: number[] = old.rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isInteger(n));

        if (oldIds.length) {
            await client.query(
                `DELETE
                 FROM tahapan_uraian_tugas
                 WHERE tugas_id = ANY ($1::int[])`,
                [oldIds]
            );
            await client.query(
                `DELETE
                 FROM tugas_pokok
                 WHERE jabatan_id = $1::uuid`,
                [id]
            );
        }

        // Insert baru
        for (const it of p.data) {
            const ins = await client.query(
                `INSERT INTO tugas_pokok
                 (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                  waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id`,
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
            const newId: number = Number(ins.rows[0].id);
            for (const t of it.tahapan ?? []) {
                await client.query(
                    `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                     VALUES ($1::int, $2::uuid, $3, NOW(), NOW())`,
                    [newId, id, t]
                );
            }
        }

        await client.query("COMMIT");
        began = false;
        return NextResponse.json({ok: true});
    } catch (e: any) {
        if (began) {
            try {
                await client.query("ROLLBACK");
            } catch {
            }
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan (FK violation)"}, {status: 400});
        }
        console.error("[tugas-pokok][PUT]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

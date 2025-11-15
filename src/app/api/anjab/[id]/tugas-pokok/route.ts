import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

/* ======================= Helpers umum ======================= */
const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const toNum = (v: any): number | null => (v == null || v === "" ? null : Number(v));

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

/* ========== Normalizer <-> Serializer hasil_kerja (inline) ========== */
/** Objek hasil */
type HasilNode = { text: string; children: HasilNode[] };

/** Parse string apapun (plain/JSON) → objek/array/primitive */
function _tryParse(s: any) {
    if (typeof s !== "string") return s;
    const t = s.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try { return JSON.parse(t); } catch { return s; }
    }
    return s;
}

/** Jika node.text ternyata JSON berisi {text,children} → gabungkan */
function _unwrapTextIfJson(node: any) {
    if (!node || typeof node !== "object") return node;
    const parsedText = _tryParse(node.text);
    if (parsedText && typeof parsedText === "object" && ("text" in parsedText || "children" in parsedText)) {
        const merged: any = {
            text: typeof (parsedText as any).text === "string" ? (parsedText as any).text : "",
            children: Array.isArray((parsedText as any).children) ? (parsedText as any).children : [],
        };
        if (Array.isArray(node.children) && node.children.length) {
            merged.children = [...merged.children, ...node.children];
        }
        return merged;
    }
    return node;
}

/** text[] (campur plain/JSON-string) → HasilNode[] */
function normalizeHasilFromDb(input: any): HasilNode[] {
    const walk = (x: any): HasilNode[] => {
        x = _tryParse(x);

        if (Array.isArray(x)) return x.flatMap(walk);

        if (typeof x === "string") {
            const parsed = _tryParse(x);
            if (parsed !== x) return walk(parsed);
            return [{ text: x, children: [] }];
        }

        if (x && typeof x === "object") {
            const unwrapped = _unwrapTextIfJson(x);
            const text = typeof unwrapped.text === "string" ? unwrapped.text : "";
            const children = walk(unwrapped.children ?? []);
            return [{ text, children }];
        }

        return [{ text: String(x), children: [] }];
    };
    return walk(input);
}

/** HasilNode[] / campuran → text[] untuk DB */
function serializeHasilForDb(input: any): string[] {
    const nodes = normalizeHasilFromDb(input);
    const toText = (n: HasilNode): string =>
        n.children && n.children.length
            ? JSON.stringify({ text: n.text ?? "", children: n.children ?? [] })
            : String(n.text ?? "");
    return nodes.map(toText);
}

/* ======================= Zod schemas ======================= */
const zIntNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseInt(v, 10) : v),
    z.number().int().nullable()
);
const zNumNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseFloat(v) : v),
    z.number().nullable()
);

/** HasilNode schema (rekursif) */
const HasilNodeSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        text: z.string(),
        children: z.array(HasilNodeSchema).default([]),
    })
);
/** Terima array objek atau array string (kompat lama) */
const HasilKerjaInputSchema = z.array(z.union([HasilNodeSchema, z.string()])).default([]);

const TahapanDetailSchema = z.object({
    nomor_tahapan: zIntNullable.optional(),
    tahapan: z.string().default(""),
    detail_tahapan: z.array(z.string()).default([]),
});

const ItemSchema = z.object({
    nomor_tugas: zIntNullable.optional(),
    uraian_tugas: z.string().default(""),
    hasil_kerja: HasilKerjaInputSchema,
    jumlah_hasil: zIntNullable.optional(),
    waktu_penyelesaian_jam: zIntNullable.optional(),
    waktu_efektif: zIntNullable.optional(),
    kebutuhan_pegawai: zNumNullable.optional(),
    detail_uraian_tugas: z.array(TahapanDetailSchema).default([]),
    // kompat lama
    tahapan: z.array(z.string()).optional(),
});
const ReplaceAllSchema = z.array(ItemSchema);

/* ======================= Loader list (GET helper) ======================= */
async function loadList(jabatanId: string) {
    const { rows } = await pool.query(
        `
    SELECT t.id, t.jabatan_id, t.nomor_tugas, t.uraian_tugas,
           t.hasil_kerja, NULL AS jumlah_hasil, NULL AS waktu_penyelesaian_jam,
           NULL AS waktu_efektif, NULL AS kebutuhan_pegawai,
           COALESCE(
             (SELECT json_agg(j.x ORDER BY j._ord_nomor NULLS LAST, j._created_at, j._id)
                FROM (SELECT u.id AS _id, u.created_at AS _created_at,
                             COALESCE(u.nomor_tahapan,0) AS _ord_nomor,
                             json_build_object(
                               'nomor_tahapan', u.nomor_tahapan,
                               'tahapan', u.tahapan,
                               'detail_tahapan',
                               COALESCE((SELECT json_agg(d.detail ORDER BY d.created_at, d.id)
                                          FROM detail_tahapan_uraian_tugas d
                                         WHERE d.tahapan_id = u.id), '[]')
                             ) AS x
                        FROM tahapan_uraian_tugas u
                       WHERE u.tugas_id = t.id
                       ORDER BY u.nomor_tahapan NULLS LAST, u.created_at, u.id) j),
             '[]'
           ) AS detail_uraian_tugas
      FROM tugas_pokok t
     WHERE t.jabatan_id = $1::uuid
     ORDER BY COALESCE(t.nomor_tugas, 2147483647), t.created_at, t.id
    `,
        [jabatanId]
    );

    return rows.map((r: any) => ({
        id: Number(r.id),
        jabatan_id: r.jabatan_id,
        nomor_tugas: toNum(r.nomor_tugas),
        uraian_tugas: r.uraian_tugas ?? "",
        hasil_kerja: normalizeHasilFromDb(Array.isArray(r.hasil_kerja) ? r.hasil_kerja : []), // ✅ objek
        jumlah_hasil: toNum(r.jumlah_hasil),
        waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
        waktu_efektif: toNum(r.waktu_efektif),
        kebutuhan_pegawai: r.kebutuhan_pegawai == null ? null : Number(r.kebutuhan_pegawai),
        detail_uraian_tugas: Array.isArray(r.detail_uraian_tugas) ? r.detail_uraian_tugas : [],
    }));
}

/* ======================= Routes ======================= */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({ error: "Unauthorized, Silakan login kembali" }, { status: 401 });

        const { id } = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        if (!(await jabatanExists(id))) {
            return NextResponse.json({ error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" }, { status: 404 });
        }

        const data = await loadList(id);
        return NextResponse.json(data, { headers: noCache });
    } catch (e: any) {
        if (e?.code === "22P02") return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        console.error("[tugas-pokok][GET]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    let began = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden, Anda tidak berhak mengakses fitur ini" }, { status: 403 });
        }
        const { id } = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        if (!(await jabatanExists(id))) {
            return NextResponse.json({ error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" }, { status: 404 });
        }

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
            detail_uraian_tugas = [],
            tahapan = undefined,
        } = p.data;

        const hasilTextArray = serializeHasilForDb(hasil_kerja); // ✅ ke text[]

        const nested =
            detail_uraian_tugas && detail_uraian_tugas.length
                ? detail_uraian_tugas
                : Array.isArray(tahapan)
                    ? tahapan.map((t, i) => ({ nomor_tahapan: i + 1, tahapan: t, detail_tahapan: [] }))
                    : [];

        await client.query("BEGIN");
        began = true;

        const ins = await client.query(
            `INSERT INTO tugas_pokok
         (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4::text[], NOW(), NOW())
       RETURNING id`,
            [id, nomor_tugas, uraian_tugas, hasilTextArray]
        );
        const newId: number = Number(ins.rows[0].id);

        // Insert ABK record into tugas_pokok_abk if a peta_jabatan exists for this jabatan
        try {
            const petaQ = await client.query(`SELECT id FROM peta_jabatan WHERE jabatan_id = $1::uuid LIMIT 1`, [id]);
            const petaId = petaQ.rows[0]?.id ?? null;
            if (petaId) {
                const kebutuhan = (kebutuhan_pegawai != null)
                    ? kebutuhan_pegawai
                    : (waktu_efektif && waktu_efektif > 0 && jumlah_hasil != null && waktu_penyelesaian_jam != null)
                        ? (Number(jumlah_hasil || 0) * Number(waktu_penyelesaian_jam || 0)) / Number(waktu_efektif)
                        : null;

                await client.query(
                    `INSERT INTO tugas_pokok_abk
                     (peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
                     VALUES ($1::uuid, $2::int, $3, $4, $5, $6, NOW(), NOW())`,
                    [petaId, newId, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan]
                );

                // Recompute kebutuhan_pegawai on peta_jabatan from tugas_pokok_abk
                await client.query(
                    `UPDATE peta_jabatan so
                     SET kebutuhan_pegawai = COALESCE((SELECT CEIL(COALESCE(SUM(tpa.kebutuhan_pegawai)::numeric,0))
                                                       FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = so.id),0),
                         updated_at = NOW()
                     WHERE so.id = $1::uuid`,
                    [petaId]
                );
            }
        } catch (e) {
            // non-blocking: if ABK insert fails, continue but log
            console.error('[tugas-pokok][POST] ABK insert failed', e);
        }

        // tahapan + detail (tidak berubah)
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

        // hitung kebutuhan_pegawai + update peta_jabatan
        // NOTE: legacy ABK columns were removed from `tugas_pokok` and ABK is now stored in `tugas_pokok_abk`.
        // If you need to compute/update `peta_jabatan.kebutuhan_pegawai` here, run the appropriate aggregation
        // against `tugas_pokok_abk` for each `peta_jabatan_id` instead.

        await client.query("COMMIT"); began = false;

        // reload satu baris (pakai loader agar hasil_kerja sudah objek)
        const data = (await loadList(id)).find((x) => x.id === newId);
        return NextResponse.json({ ok: true, data });
    } catch (e: any) {
        if (began) { try { await pool.query("ROLLBACK"); } catch {} }
        if (e?.code === "22P02") return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        if (e?.code === "23503") return NextResponse.json({ error: "jabatan_id tidak ditemukan" }, { status: 400 });
        if (e?.code === "23505") return NextResponse.json({ error: "Duplikasi nomor_tahapan pada satu tugas" }, { status: 400 });
        console.error("[tugas-pokok][POST]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        try { (client as any).release?.(); } catch {}
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
        const { id } = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        if (!(await jabatanExists(id))) {
            return NextResponse.json({ error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" }, { status: 404 });
        }

        const json = await req.json().catch(() => ([]));
        const p = ReplaceAllSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        await client.query("BEGIN"); began = true;

        const old = await client.query(`SELECT id FROM tugas_pokok WHERE jabatan_id = $1::uuid`, [id]);
        const oldIds: number[] = old.rows.map((r: any) => Number(r.id)).filter(Number.isInteger);

        if (oldIds.length) {
            await client.query(`DELETE FROM tahapan_uraian_tugas WHERE tugas_id = ANY ($1::int[])`, [oldIds]);
            await client.query(`DELETE FROM tugas_pokok WHERE jabatan_id = $1::uuid`, [id]);
        }

        for (const it of p.data) {
            const hasilTextArray = serializeHasilForDb(it.hasil_kerja); // ✅

            const ins = await client.query(
                `INSERT INTO tugas_pokok
               (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4::text[], NOW(), NOW())
             RETURNING id`,
                    [
                        id,
                        it.nomor_tugas ?? null,
                        it.uraian_tugas ?? "",
                        hasilTextArray,
                    ]
                );
            const newId = Number(ins.rows[0].id);

            // Insert ABK record into tugas_pokok_abk if peta_jabatan exists for this jabatan
            try {
                const petaQ = await client.query(`SELECT id FROM peta_jabatan WHERE jabatan_id = $1::uuid LIMIT 1`, [id]);
                const petaId = petaQ.rows[0]?.id ?? null;
                if (petaId) {
                    const jumlah_hasil_val = it.jumlah_hasil ?? null;
                    const waktu_penyelesaian_jam_val = it.waktu_penyelesaian_jam ?? null;
                    const waktu_efektif_val = it.waktu_efektif ?? null;
                    const kebutuhan_val = it.kebutuhan_pegawai ?? ((waktu_efektif_val && waktu_efektif_val > 0 && jumlah_hasil_val != null && waktu_penyelesaian_jam_val != null)
                        ? (Number(jumlah_hasil_val || 0) * Number(waktu_penyelesaian_jam_val || 0)) / Number(waktu_efektif_val)
                        : null);

                    await client.query(
                        `INSERT INTO tugas_pokok_abk (peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
                         VALUES ($1::uuid, $2::int, $3, $4, $5, $6, NOW(), NOW())`,
                        [petaId, newId, jumlah_hasil_val, waktu_penyelesaian_jam_val, waktu_efektif_val, kebutuhan_val]
                    );

                    await client.query(
                        `UPDATE peta_jabatan so
                         SET kebutuhan_pegawai = COALESCE((SELECT CEIL(COALESCE(SUM(tpa.kebutuhan_pegawai)::numeric,0))
                                                           FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = so.id),0),
                             updated_at = NOW()
                         WHERE so.id = $1::uuid`,
                        [petaId]
                    );
                }
            } catch (e) {
                console.error('[tugas-pokok][PUT] ABK insert failed', e);
            }

            const nested =
                (it.detail_uraian_tugas && it.detail_uraian_tugas.length)
                    ? it.detail_uraian_tugas
                    : (Array.isArray(it.tahapan)
                        ? it.tahapan.map((t, i) => ({ nomor_tahapan: i + 1, tahapan: t, detail_tahapan: [] }))
                        : []);

            for (let i = 0; i < nested.length; i++) {
                const td = nested[i];
                const nomorTah = td.nomor_tahapan ?? i + 1;

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

                        // legacy: no tugas_pokok kebutuhan update here (migrated to tugas_pokok_abk)
                    }

                        // NOTE: peta_jabatan.kebutuhan_pegawai aggregation should be computed from tugas_pokok_abk per peta_jabatan.

        await client.query("COMMIT"); began = false;

        const data = await loadList(id);
        return NextResponse.json({ ok: true, data });
    } catch (e: any) {
        if (began) { try { await client.query("ROLLBACK"); } catch {} }
        if (e?.code === "22P02") return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        if (e?.code === "23503") return NextResponse.json({ error: "jabatan_id tidak ditemukan" }, { status: 400 });
        if (e?.code === "23505") return NextResponse.json({ error: "Duplikasi nomor_tahapan pada satu tugas" }, { status: 400 });
        console.error("[tugas-pokok][PUT]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        try { client.release(); } catch {}
    }
}

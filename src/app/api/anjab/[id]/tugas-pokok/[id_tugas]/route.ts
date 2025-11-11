import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { z } from "zod";
import { getUserFromReq, hasRole } from "@/lib/auth";

/* ======================= Helpers ======================= */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const isIntId = (s: string) => /^\d+$/.test(s);
const toNum = (v: any): number | null => (v == null || v === "" ? null : Number(v));

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

/* ===== hasil_kerja normalizer/serializer (inline) ===== */
type HasilNode = { text: string; children: HasilNode[] };
function _tryParse(s: any) {
    if (typeof s !== "string") return s;
    const t = s.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try { return JSON.parse(t); } catch { return s; }
    }
    return s;
}
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
function normalizeHasilFromDb(input: any): HasilNode[] {
    const walk = (x: any): HasilNode[] => {
        x = _tryParse(x);
        if (Array.isArray(x)) return x.flatMap(walk);
        if (typeof x === "string") {
            const p = _tryParse(x); if (p !== x) return walk(p);
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
function serializeHasilForDb(input: any): string[] {
    const nodes = normalizeHasilFromDb(input);
    const toText = (n: HasilNode): string =>
        n.children && n.children.length
            ? JSON.stringify({ text: n.text ?? "", children: n.children ?? [] })
            : String(n.text ?? "");
    return nodes.map(toText);
}

/* ======================= Zod ======================= */
const zIntNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseInt(v, 10) : v),
    z.number().int().nullable()
);
const zNumNullable = z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? parseFloat(v) : v),
    z.number().nullable()
);

const HasilNodeSchema: z.ZodType<any> = z.lazy(() =>
    z.object({ text: z.string(), children: z.array(HasilNodeSchema).default([]) })
);
const HasilKerjaInputSchema = z.array(z.union([HasilNodeSchema, z.string()])).optional();

const TahapanDetailSchema = z.object({
    nomor_tahapan: zIntNullable.optional(),
    tahapan: z.string().default(""),
    detail_tahapan: z.array(z.string()).default([]),
});

const PatchSchema = z.object({
    nomor_tugas: zIntNullable.optional(),
    uraian_tugas: z.string().optional(),
    hasil_kerja: HasilKerjaInputSchema,
    jumlah_hasil: zIntNullable.optional(),
    waktu_penyelesaian_jam: zIntNullable.optional(),
    waktu_efektif: zIntNullable.optional(),
    kebutuhan_pegawai: zNumNullable.optional(),
    detail_uraian_tugas: z.array(TahapanDetailSchema).optional(),
    // kompat lama
    tahapan: z.array(z.string()).optional(),
});

/* ======================= PATCH ======================= */
export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string; id_tugas: string }> }
) {
    const client = await pool.connect();
    let began = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden, Anda tidak berhak mengakses fitur ini" }, { status: 403 });
        }

        const { id, id_tugas } = await ctx.params;
        if (!isUuid(id) || !isIntId(id_tugas)) {
            return NextResponse.json({ error: "Invalid, id harus UUID, id_tugas harus angka" }, { status: 400 });
        }
        const tugasId = Number(id_tugas);
        if (!(await jabatanExists(id))) {
            return NextResponse.json({ error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" }, { status: 404 });
        }

        const json = await req.json().catch(() => ({}));
        const p = PatchSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({ error: "Validasi gagal", detail: p.error.flatten() }, { status: 400 });
        }

        const fields: string[] = [];
        const values: any[] = [];
        const push = (sql: string, v: any) => { fields.push(sql); values.push(v); };

        if (p.data.nomor_tugas !== undefined) push(`nomor_tugas = $${values.length + 1}`, p.data.nomor_tugas);
        if (p.data.uraian_tugas !== undefined) push(`uraian_tugas = $${values.length + 1}`, p.data.uraian_tugas);
        if (p.data.hasil_kerja !== undefined) {
            const hasilText = serializeHasilForDb(p.data.hasil_kerja);
            push(`hasil_kerja = $${values.length + 1}::text[]`, hasilText);
        }
        if (p.data.jumlah_hasil !== undefined) push(`jumlah_hasil = $${values.length + 1}`, p.data.jumlah_hasil);
        if (p.data.waktu_penyelesaian_jam !== undefined)
            push(`waktu_penyelesaian_jam = $${values.length + 1}`, p.data.waktu_penyelesaian_jam);
        if (p.data.waktu_efektif !== undefined) push(`waktu_efektif = $${values.length + 1}`, p.data.waktu_efektif);

        await client.query("BEGIN"); began = true;

        if (fields.length) {
            values.push(id, tugasId);
            const q = `
        UPDATE tugas_pokok
           SET ${fields.join(", ")}, updated_at = NOW()
         WHERE jabatan_id = $${values.length - 1}::uuid
           AND id = $${values.length}::int
      `;
            const up = await client.query(q, values);
            if (!up.rowCount) {
                await client.query("ROLLBACK"); began = false;
                return NextResponse.json({ error: "Not Found, (Tugas Pokok tidak ditemukan)" }, { status: 404 });
            }
        }

        // Replace-all tahapan jika dikirim (sama seperti punyamu)
        let nested = p.data.detail_uraian_tugas;
        if ((!nested || !nested.length) && Array.isArray(p.data.tahapan)) {
            nested = p.data.tahapan.map((t, i) => ({ nomor_tahapan: i + 1, tahapan: t, detail_tahapan: [] }));
        }
        if (nested) {
            await client.query(`DELETE FROM tahapan_uraian_tugas WHERE tugas_id = $1::int`, [tugasId]);
            for (let i = 0; i < nested.length; i++) {
                const td = nested[i];
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

        await client.query(
            `UPDATE tugas_pokok
         SET kebutuhan_pegawai =
           CASE WHEN COALESCE(waktu_efektif, 0) > 0
             THEN (COALESCE(jumlah_hasil,0)::numeric * COALESCE(waktu_penyelesaian_jam,0)::numeric) / waktu_efektif::numeric
             ELSE NULL END,
             updated_at = NOW()
       WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, tugasId]
        );

        await client.query(
            `UPDATE peta_jabatan so
         SET kebutuhan_pegawai = COALESCE(
           (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric,0))
              FROM tugas_pokok tp WHERE tp.jabatan_id = $1::uuid),0),
             updated_at = NOW()
       WHERE so.id = (SELECT peta_id FROM jabatan WHERE id = $1::uuid)`,
            [id]
        );

        await client.query("COMMIT"); began = false;

        // reload satu baris
        const { rows } = await pool.query(
            `
      SELECT t.id, t.jabatan_id, t.nomor_tugas, t.uraian_tugas,
             t.hasil_kerja, t.jumlah_hasil, t.waktu_penyelesaian_jam,
             t.waktu_efektif, t.kebutuhan_pegawai,
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
       WHERE t.jabatan_id = $1::uuid AND t.id = $2::int
      `,
            [id, tugasId]
        );
        if (!rows.length) {
            return NextResponse.json({ error: "Not Found, (Tugas Pokok tidak ditemukan)" }, { status: 404 });
        }
        const r = rows[0];
        const data = {
            id: Number(r.id),
            jabatan_id: r.jabatan_id,
            nomor_tugas: toNum(r.nomor_tugas),
            uraian_tugas: r.uraian_tugas ?? "",
            hasil_kerja: normalizeHasilFromDb(Array.isArray(r.hasil_kerja) ? r.hasil_kerja : []),
            jumlah_hasil: toNum(r.jumlah_hasil),
            waktu_penyelesaian_jam: toNum(r.waktu_penyelesaian_jam),
            waktu_efektif: toNum(r.waktu_efektif),
            kebutuhan_pegawai: r.kebutuhan_pegawai == null ? null : Number(r.kebutuhan_pegawai),
            detail_uraian_tugas: Array.isArray(r.detail_uraian_tugas) ? r.detail_uraian_tugas : [],
        };

        return NextResponse.json({ ok: true, data });
    } catch (e: any) {
        if (began) { try { await client.query("ROLLBACK"); } catch {} }
        if (e?.code === "22P02") return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        if (e?.code === "23503") return NextResponse.json({ error: "jabatan_id / tugas_id tidak ditemukan" }, { status: 400 });
        if (e?.code === "23505") return NextResponse.json({ error: "Duplikasi nomor_tahapan pada satu tugas" }, { status: 400 });
        console.error("[tugas-pokok][PATCH]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    } finally {
        try { (client as any).release?.(); } catch {}
    }
}

/* ======================= DELETE ======================= */
export async function DELETE(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; id_tugas: string }> }
) {
    try {
        const user = getUserFromReq(_req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden, Anda tidak berhak mengakses fitur ini" }, { status: 403 });
        }
        const { id, id_tugas } = await ctx.params;
        if (!isUuid(id) || !isIntId(id_tugas)) {
            return NextResponse.json({ error: "Invalid, id harus UUID, id_tugas harus angka" }, { status: 400 });
        }
        const tugasId = Number(id_tugas);
        if (!(await jabatanExists(id))) {
            return NextResponse.json({ error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)" }, { status: 404 });
        }

        const del = await pool.query(
            `DELETE FROM tugas_pokok WHERE jabatan_id = $1::uuid AND id = $2::int`,
            [id, tugasId]
        );
        if (!del.rowCount) {
            return NextResponse.json({ error: "Not Found, (Tugas Pokok tidak ditemukan)" }, { status: 404 });
        }

        await pool.query(
            `UPDATE peta_jabatan so
         SET kebutuhan_pegawai = COALESCE(
           (SELECT CEIL(COALESCE(SUM(tp.kebutuhan_pegawai)::numeric,0))
              FROM tugas_pokok tp WHERE tp.jabatan_id = $1::uuid),0),
             updated_at = NOW()
       WHERE so.id = (SELECT peta_id FROM jabatan WHERE id = $1::uuid)`,
            [id]
        );

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        if (e?.code === "22P02") return NextResponse.json({ error: "Invalid, id harus UUID" }, { status: 400 });
        console.error("[tugas-pokok][DELETE]", e);
        return NextResponse.json({ error: "General Error" }, { status: 500 });
    }
}

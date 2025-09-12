import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
};

// ===== Helpers normalisasi =====
const toTrimmed = (v: unknown) => String(v ?? "").trim();
const strOpt = z.union([z.string(), z.number()]).transform(toTrimmed);

const strArr = z
    .union([
        z.array(z.union([z.string(), z.number()])),
        z.union([z.string(), z.number()]) // izinkan string tunggal → array 1 item
    ])
    .transform((val) => {
        const arr = Array.isArray(val) ? val : [val];
        return arr.map(toTrimmed).filter(Boolean);
    });

// skema body
const SyaratSchema = z.object({
    keterampilan_kerja: strArr.optional(),
    bakat_kerja: strArr.optional(),
    temperamen_kerja: strArr.optional(),
    minat_kerja: strArr.optional(),
    upaya_fisik: strArr.optional(),
    fungsi_pekerja: strArr.optional(),

    kondisi_fisik_jenkel: strOpt.optional(),
    kondisi_fisik_umur: strOpt.optional(),
    kondisi_fisik_tb: strOpt.optional(),
    kondisi_fisik_bb: strOpt.optional(),
    kondisi_fisik_pb: strOpt.optional(),
    kondisi_fisik_tampilan: strOpt.optional(),
    kondisi_fisik_keadaan: strOpt.optional(),

    upsert: z.boolean().optional(), // default true agar UX enak
});

// ===== GET: kembalikan 1 baris atau default kosong =====
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        const {id} = await ctx.params;
        const {rows} = await pool.query(
            `SELECT id_syarat,
                    id_jabatan,
                    keterampilan_kerja,
                    bakat_kerja,
                    temperamen_kerja,
                    minat_kerja,
                    upaya_fisik,
                    kondisi_fisik_jenkel,
                    kondisi_fisik_umur,
                    kondisi_fisik_tb,
                    kondisi_fisik_bb,
                    kondisi_fisik_pb,
                    kondisi_fisik_tampilan,
                    kondisi_fisik_keadaan,
                    fungsi_pekerja,
                    created_at,
                    updated_at
             FROM syarat_jabatan
             WHERE id_jabatan = $1 LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            // default kosong agar form bisa langsung dipakai
            return NextResponse.json({
                id_syarat: null,
                id_jabatan: id,
                keterampilan_kerja: [],
                bakat_kerja: [],
                temperamen_kerja: [],
                minat_kerja: [],
                upaya_fisik: [],
                fungsi_pekerja: [],
                kondisi_fisik_jenkel: "",
                kondisi_fisik_umur: "",
                kondisi_fisik_tb: "",
                kondisi_fisik_bb: "",
                kondisi_fisik_pb: "",
                kondisi_fisik_tampilan: "",
                kondisi_fisik_keadaan: "",
            }, {headers: noCache});
        }

        // pastikan array tidak null
        const r = rows[0];
        r.keterampilan_kerja = Array.isArray(r.keterampilan_kerja) ? r.keterampilan_kerja : [];
        r.bakat_kerja = Array.isArray(r.bakat_kerja) ? r.bakat_kerja : [];
        r.temperamen_kerja = Array.isArray(r.temperamen_kerja) ? r.temperamen_kerja : [];
        r.minat_kerja = Array.isArray(r.minat_kerja) ? r.minat_kerja : [];
        r.upaya_fisik = Array.isArray(r.upaya_fisik) ? r.upaya_fisik : [];
        r.fungsi_pekerja = Array.isArray(r.fungsi_pekerja) ? r.fungsi_pekerja : [];

        return NextResponse.json(r, {headers: noCache});
    } catch (e) {
        console.error("[syarat-jabatan][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

// ===== PATCH: update sebagian + upsert bila belum ada =====
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const client = await pool.connect();
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params;
        const json = await req.json().catch(() => ({}));
        const p = SyaratSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }

        const data = p.data;
        const upsert = data.upsert !== false; // default true

        // Ambil yg ada
        const {rows} = await client.query(
            `SELECT id_syarat
             FROM syarat_jabatan
             WHERE id_jabatan = $1 LIMIT 1`,
            [id]
        );

        await client.query("BEGIN");

        if (rows.length === 0) {
            if (!upsert) {
                await client.query("ROLLBACK");
                return NextResponse.json({error: "Belum ada record dan upsert=false"}, {status: 404});
            }
            // INSERT baru: set semua kolom, kosongkan yang tidak ada
            const ins = await client.query(
                `INSERT INTO syarat_jabatan
                 (id_jabatan,
                  keterampilan_kerja, bakat_kerja, temperamen_kerja, minat_kerja, upaya_fisik,
                  kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb, kondisi_fisik_bb, kondisi_fisik_pb,
                  kondisi_fisik_tampilan, kondisi_fisik_keadaan,
                  fungsi_pekerja,
                  created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6,
                         $7, $8, $9, $10, $11, $12, $13,
                         $14,
                         NOW(), NOW()) RETURNING *`,
                [
                    id,
                    data.keterampilan_kerja ?? [],
                    data.bakat_kerja ?? [],
                    data.temperamen_kerja ?? [],
                    data.minat_kerja ?? [],
                    data.upaya_fisik ?? [],
                    data.kondisi_fisik_jenkel ?? "",
                    data.kondisi_fisik_umur ?? "",
                    data.kondisi_fisik_tb ?? "",
                    data.kondisi_fisik_bb ?? "",
                    data.kondisi_fisik_pb ?? "",
                    data.kondisi_fisik_tampilan ?? "",
                    data.kondisi_fisik_keadaan ?? "",
                    data.fungsi_pekerja ?? [],
                ]
            );
            await client.query("COMMIT");
            const r = ins.rows[0];
            r.keterampilan_kerja = r.keterampilan_kerja ?? [];
            r.bakat_kerja = r.bakat_kerja ?? [];
            r.temperamen_kerja = r.temperamen_kerja ?? [];
            r.minat_kerja = r.minat_kerja ?? [];
            r.upaya_fisik = r.upaya_fisik ?? [];
            r.fungsi_pekerja = r.fungsi_pekerja ?? [];
            return NextResponse.json({ok: true, data: r});
        }

        // UPDATE partial: hanya kolom yang dikirim
        const fields: string[] = [];
        const values: any[] = [];

        const setIf = (key: string, val: unknown) => {
            if (val !== undefined) {
                fields.push(`${key}=$${fields.length + 1}`);
                values.push(val);
            }
        };

        setIf("keterampilan_kerja", data.keterampilan_kerja);
        setIf("bakat_kerja", data.bakat_kerja);
        setIf("temperamen_kerja", data.temperamen_kerja);
        setIf("minat_kerja", data.minat_kerja);
        setIf("upaya_fisik", data.upaya_fisik);
        setIf("fungsi_pekerja", data.fungsi_pekerja);

        setIf("kondisi_fisik_jenkel", data.kondisi_fisik_jenkel ?? "");
        setIf("kondisi_fisik_umur", data.kondisi_fisik_umur ?? "");
        setIf("kondisi_fisik_tb", data.kondisi_fisik_tb ?? "");
        setIf("kondisi_fisik_bb", data.kondisi_fisik_bb ?? "");
        setIf("kondisi_fisik_pb", data.kondisi_fisik_pb ?? "");
        setIf("kondisi_fisik_tampilan", data.kondisi_fisik_tampilan ?? "");
        setIf("kondisi_fisik_keadaan", data.kondisi_fisik_keadaan ?? "");

        if (!fields.length) {
            await client.query("ROLLBACK");
            return NextResponse.json({ok: true}); // tidak ada perubahan
        }

        values.push(id);
        const q = `UPDATE syarat_jabatan
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE id_jabatan = $${values.length} RETURNING *`;
        const up = await client.query(q, values);
        await client.query("COMMIT");
        const r = up.rows[0];
        r.keterampilan_kerja = r.keterampilan_kerja ?? [];
        r.bakat_kerja = r.bakat_kerja ?? [];
        r.temperamen_kerja = r.temperamen_kerja ?? [];
        r.minat_kerja = r.minat_kerja ?? [];
        r.upaya_fisik = r.upaya_fisik ?? [];
        r.fungsi_pekerja = r.fungsi_pekerja ?? [];
        return NextResponse.json({ok: true, data: r});
    } catch (e) {
        await pool.query("ROLLBACK");
        console.error("[syarat-jabatan][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        client.release();
    }
}

// src/app/api/syarat-jabatan/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

// UUID helper
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

// Helpers normalisasi
const toTrimmed = (v: unknown) => String(v ?? "").trim();
const strOpt = z.union([z.string(), z.number()]).transform(toTrimmed);

const strArr = z
    .union([z.array(z.union([z.string(), z.number()])), z.union([z.string(), z.number()])])
    .transform((val) => {
        const arr = Array.isArray(val) ? val : [val];
        return arr.map(toTrimmed).filter(Boolean);
    });

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

    upsert: z.boolean().optional(),
});

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id]
    );
    return !!q.rows[0]?.exists;
}

// GET
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});

        const {id} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }

        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found (Dokumen analisis jabatan tidak ada)"}, {status: 404});
        }

        const {rows} = await pool.query(
            `SELECT id,
                    jabatan_id,
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
                    fungsi_pekerja
             FROM syarat_jabatan
             WHERE jabatan_id = $1::uuid
       LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return NextResponse.json(
                {
                    jabatan_id: id,
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
                },
                {headers: noCache}
            );
        }

        const r = rows[0];
        r.keterampilan_kerja = Array.isArray(r.keterampilan_kerja) ? r.keterampilan_kerja : [];
        r.bakat_kerja = Array.isArray(r.bakat_kerja) ? r.bakat_kerja : [];
        r.temperamen_kerja = Array.isArray(r.temperamen_kerja) ? r.temperamen_kerja : [];
        r.minat_kerja = Array.isArray(r.minat_kerja) ? r.minat_kerja : [];
        r.upaya_fisik = Array.isArray(r.upaya_fisik) ? r.upaya_fisik : [];
        r.fungsi_pekerja = Array.isArray(r.fungsi_pekerja) ? r.fungsi_pekerja : [];

        return NextResponse.json(r, {headers: noCache});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }
        console.error("[syarat-jabatan][GET]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

// PATCH
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    let client;
    let txBegan = false;
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }

        const {id} = await ctx.params;
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }

        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found (Dokumen analisis jabatan tidak ada)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const p = SyaratSchema.safeParse(json);
        if (!p.success) {
            return NextResponse.json({error: "Validasi gagal", detail: p.error.flatten()}, {status: 400});
        }
        const data = p.data;
        const upsert = data.upsert !== false;

        client = await pool.connect();

        const {rows} = await client.query(
            `SELECT id
             FROM syarat_jabatan
             WHERE jabatan_id = $1::uuid LIMIT 1`,
            [id]
        );

        await client.query("BEGIN");
        txBegan = true;

        if (!rows.length) {
            if (!upsert) {
                await client.query("ROLLBACK");
                txBegan = false;
                return NextResponse.json({error: "Belum ada record dan upsert=false"}, {status: 404});
            }

            // ⬇⬇⬇ RETURNING tanpa created_at/updated_at
            const ins = await client.query(
                `INSERT INTO syarat_jabatan
                 (jabatan_id,
                  keterampilan_kerja, bakat_kerja, temperamen_kerja, minat_kerja, upaya_fisik,
                  kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb, kondisi_fisik_bb, kondisi_fisik_pb,
                  kondisi_fisik_tampilan, kondisi_fisik_keadaan,
                  fungsi_pekerja,
                  created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6,
                         $7, $8, $9, $10, $11, $12, $13,
                         $14,
                         NOW(), NOW()) RETURNING id, jabatan_id, keterampilan_kerja, bakat_kerja, temperamen_kerja, minat_kerja, upaya_fisik,
                   kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb, kondisi_fisik_bb, kondisi_fisik_pb,
                   kondisi_fisik_tampilan, kondisi_fisik_keadaan, fungsi_pekerja`,
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
            txBegan = false;

            const r = ins.rows[0];
            r.keterampilan_kerja = r.keterampilan_kerja ?? [];
            r.bakat_kerja = r.bakat_kerja ?? [];
            r.temperamen_kerja = r.temperamen_kerja ?? [];
            r.minat_kerja = r.minat_kerja ?? [];
            r.upaya_fisik = r.upaya_fisik ?? [];
            r.fungsi_pekerja = r.fungsi_pekerja ?? [];
            return NextResponse.json({ok: true, data: r});
        }

        // Build partial UPDATE
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
            txBegan = false;
            return NextResponse.json({ok: true});
        }

        values.push(id);
        // ⬇⬇⬇ RETURNING tanpa created_at/updated_at
        const q = `UPDATE syarat_jabatan
                   SET ${fields.join(", ")},
                       updated_at=NOW()
                   WHERE jabatan_id = $${values.length}::uuid
               RETURNING id, jabatan_id, keterampilan_kerja, bakat_kerja, temperamen_kerja, minat_kerja, upaya_fisik,
                         kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb, kondisi_fisik_bb, kondisi_fisik_pb,
                         kondisi_fisik_tampilan, kondisi_fisik_keadaan, fungsi_pekerja`;
        const up = await client.query(q, values);
        await client.query("COMMIT");
        txBegan = false;

        const r = up.rows[0];
        r.keterampilan_kerja = r.keterampilan_kerja ?? [];
        r.bakat_kerja = r.bakat_kerja ?? [];
        r.temperamen_kerja = r.temperamen_kerja ?? [];
        r.minat_kerja = r.minat_kerja ?? [];
        r.upaya_fisik = r.upaya_fisik ?? [];
        r.fungsi_pekerja = r.fungsi_pekerja ?? [];

        return NextResponse.json({ok: true, data: r});
    } catch (e: any) {
        if (client && txBegan) {
            try {
                await client.query("ROLLBACK");
            } catch {
            }
            txBegan = false;
        }
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan (FK violation)"}, {status: 400});
        }
        console.error("[syarat-jabatan][PATCH]", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    } finally {
        if (client) client.release();
    }
}

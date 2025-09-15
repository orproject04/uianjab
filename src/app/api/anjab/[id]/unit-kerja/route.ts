// app/api/unit-kerja/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const UnitKerjaSchema = z.object({
    jpt_utama: z.string().optional().nullable(),
    jpt_madya: z.string().optional().nullable(),
    jpt_pratama: z.string().optional().nullable(),
    administrator: z.string().optional().nullable(),
    pengawas: z.string().optional().nullable(),
    pelaksana: z.string().optional().nullable(),
    jabatan_fungsional: z.string().optional().nullable(),
    upsert: z.boolean().optional(), // default true
});

// Helper: cek UUID v1–v5
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
    return UUID_RE.test(s);
}

async function jabatanExists(id: string): Promise<boolean> {
    const q = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists",
        [id],
    );
    return !!q.rows[0]?.exists;
}

// GET: ambil satu baris unit_kerja (atau objek kosong bila belum ada), tapi id wajib ada di "jabatan"
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user) return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});

        const {id} = await ctx.params;

        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }

        // ✅ Pastikan id jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const {rows} = await pool.query(
            `SELECT jabatan_id,
                    jpt_utama,
                    jpt_madya,
                    jpt_pratama,
                    administrator,
                    pengawas,
                    pelaksana,
                    jabatan_fungsional
             FROM unit_kerja
             WHERE jabatan_id = $1::uuid
       LIMIT 1`,
            [id],
        );

        // Jika belum ada baris di unit_kerja → kembalikan default kosong (tetap 200)
        if (!rows.length) {
            return NextResponse.json(
                {
                    jabatan_id: id,
                    jpt_utama: "",
                    jpt_madya: "",
                    jpt_pratama: "",
                    administrator: "",
                    pengawas: "",
                    pelaksana: "",
                    jabatan_fungsional: "",
                },
                {
                    headers: {
                        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                        Pragma: "no-cache",
                        Expires: "0",
                    },
                },
            );
        }

        return NextResponse.json(rows[0], {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error("[unit-kerja][GET] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

// PATCH: update atau upsert; namun hanya lanjut jika id ada di "jabatan"
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params;

        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }

        // ✅ Pastikan id jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const parsed = UnitKerjaSchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: parsed.error.flatten()},
                {status: 400},
            );
        }

        const {
            jpt_utama = "",
            jpt_madya = "",
            jpt_pratama = "",
            administrator = "",
            pengawas = "",
            pelaksana = "",
            jabatan_fungsional = "",
            upsert = true,
        } = parsed.data;

        // UPDATE dulu
        const up = await pool.query(
            `UPDATE unit_kerja
             SET jpt_utama=$1,
                 jpt_madya=$2,
                 jpt_pratama=$3,
                 administrator=$4,
                 pengawas=$5,
                 pelaksana=$6,
                 jabatan_fungsional=$7,
                 updated_at=NOW()
             WHERE jabatan_id = $8::uuid`,
            [jpt_utama, jpt_madya, jpt_pratama, administrator, pengawas, pelaksana, jabatan_fungsional, id],
        );

        if (up.rowCount === 0) {
            if (!upsert) {
                return NextResponse.json({error: "Data belum ada, dan upsert=false"}, {status: 404});
            }
            // INSERT baru
            await pool.query(
                `INSERT INTO unit_kerja
                 (jabatan_id, jpt_utama, jpt_madya, jpt_pratama, administrator, pengawas, pelaksana, jabatan_fungsional,
                  created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [id, jpt_utama, jpt_madya, jpt_pratama, administrator, pengawas, pelaksana, jabatan_fungsional],
            );
        }

        const {rows} = await pool.query(
            `SELECT jabatan_id,
                    jpt_utama,
                    jpt_madya,
                    jpt_pratama,
                    administrator,
                    pengawas,
                    pelaksana,
                    jabatan_fungsional
             FROM unit_kerja
             WHERE jabatan_id = $1::uuid
       LIMIT 1`,
            [id],
        );

        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        if (e?.code === "23503") {
            // kalau FK jabatan_id tidak valid (harusnya tertangkap oleh jabatanExists, tapi jaga-jaga)
            return NextResponse.json({error: "jabatan_id tidak ditemukan"}, {status: 400});
        }
        console.error("[unit-kerja][PATCH] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

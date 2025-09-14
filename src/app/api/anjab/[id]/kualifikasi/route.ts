// src/app/api/kualifikasi/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const Schema = z.object({
    pendidikan_formal: z.array(z.string()).optional().nullable(),
    diklat_penjenjangan: z.array(z.string()).optional().nullable(),
    diklat_teknis: z.array(z.string()).optional().nullable(),
    diklat_fungsional: z.array(z.string()).optional().nullable(),
    pengalaman_kerja: z.array(z.string()).optional().nullable(),
    upsert: z.boolean().optional(), // default true
});

// Helper: cek UUID v1–v5
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

// GET: id wajib ada di jabatan; jika kualifikasi belum ada → balikan default array kosong
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});

        const {id} = await ctx.params;

        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }

        // ✅ pastikan id jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found (Dokumen analisis jabatan tidak ada)"}, {status: 404});
        }

        const {rows} = await pool.query(
            `SELECT jabatan_id,
                    pendidikan_formal,
                    diklat_penjenjangan,
                    diklat_teknis,
                    diklat_fungsional,
                    pengalaman_kerja
             FROM kualifikasi_jabatan
             WHERE jabatan_id = $1::uuid
       LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return NextResponse.json(
                {
                    jabatan_id: id,
                    pendidikan_formal: [],
                    diklat_penjenjangan: [],
                    diklat_teknis: [],
                    diklat_fungsional: [],
                    pengalaman_kerja: [],
                },
                {
                    headers: {
                        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                        Pragma: "no-cache",
                        Expires: "0",
                    },
                }
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
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }
        console.error("[kualifikasi][GET] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

// PATCH: hanya lanjut jika id ada di jabatan; upsert default true
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }

        const {id} = await ctx.params;

        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }

        // ✅ pastikan id jabatan ada
        if (!(await jabatanExists(id))) {
            return NextResponse.json({error: "Not Found (Dokumen analisis jabatan tidak ada)"}, {status: 404});
        }

        const json = await req.json().catch(() => ({}));
        const p = Schema.safeParse(json);
        if (!p.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: p.error.flatten()},
                {status: 400}
            );
        }

        const {
            pendidikan_formal = [],
            diklat_penjenjangan = [],
            diklat_teknis = [],
            diklat_fungsional = [],
            pengalaman_kerja = [],
            upsert = true,
        } = p.data;

        // UPDATE dulu
        const up = await pool.query(
            `UPDATE kualifikasi_jabatan
             SET pendidikan_formal=$1,
                 diklat_penjenjangan=$2,
                 diklat_teknis=$3,
                 diklat_fungsional=$4,
                 pengalaman_kerja=$5,
                 updated_at=NOW()
             WHERE jabatan_id = $6::uuid`,
            [pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja, id]
        );

        if (up.rowCount === 0) {
            if (!upsert) {
                return NextResponse.json({error: "Data belum ada, upsert=false"}, {status: 404});
            }
            await pool.query(
                `INSERT INTO kualifikasi_jabatan
                 (jabatan_id, pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional,
                  pengalaman_kerja, created_at, updated_at)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW(), NOW())`,
                [id, pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja]
            );
        }

        const {rows} = await pool.query(
            `SELECT jabatan_id,
                    pendidikan_formal,
                    diklat_penjenjangan,
                    diklat_teknis,
                    diklat_fungsional,
                    pengalaman_kerja
             FROM kualifikasi_jabatan
             WHERE jabatan_id = $1::uuid
       LIMIT 1`,
            [id]
        );

        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid id (must be a UUID)"}, {status: 400});
        }
        if (e?.code === "23503") {
            return NextResponse.json({error: "jabatan_id tidak ditemukan (FK violation)"}, {status: 400});
        }
        console.error("[kualifikasi][PATCH] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

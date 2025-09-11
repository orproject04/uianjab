// app/api/anjab/[id]/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

const UpdateSchema = z.object({
    kode_jabatan: z.string().min(1),
    nama_jabatan: z.string().min(1),
    ikhtisar_jabatan: z.string().optional().nullable(),
    kelas_jabatan: z.string().optional().nullable(),
    prestasi_diharapkan: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        const {id} = await ctx.params; // <-- await!
        const {rows} = await pool.query(
            `SELECT id_jabatan, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan
             FROM jabatan
             WHERE id_jabatan = $1`,
            [id]
        );
        if (!rows.length) return NextResponse.json({error: "Not Found"}, {status: 404});
        return NextResponse.json(rows[0], {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const {id} = await ctx.params; // <-- await!
        const json = await req.json().catch(() => ({}));
        const parsed = UpdateSchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json({error: "Validasi gagal", detail: parsed.error.flatten()}, {status: 400});
        }
        const {kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan} = parsed.data;

        const {rowCount} = await pool.query(
            `UPDATE jabatan
             SET kode_jabatan=$1,
                 nama_jabatan=$2,
                 ikhtisar_jabatan=COALESCE($3, ''),
                 kelas_jabatan=COALESCE($4, ''),
                 prestasi_diharapkan=COALESCE($5, ''),
                 updated_at=NOW()
             WHERE id_jabatan = $6`,
            [kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, id]
        );
        if (!rowCount) return NextResponse.json({error: "Not Found"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id_jabatan, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan
             FROM jabatan
             WHERE id_jabatan = $1`,
            [id]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e) {
        console.error("PATCH error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}
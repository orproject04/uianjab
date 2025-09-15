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

// Helper: cek UUID v1–v5
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
    return UUID_RE.test(s);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(_req);
        if (!user) return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});

        const {id} = await ctx.params; // <-- await!
        // Lapis 1: early validation
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }

        const {rows} = await pool.query(
            `SELECT id, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan
             FROM jabatan
             WHERE id = $1::uuid`,
            [id]
        );
        if (!rows.length) return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});

        return NextResponse.json(rows[0], {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    } catch (e: any) {
        // Lapis 2: map error cast UUID dari PostgreSQL
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error(e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const {id} = await ctx.params; // <-- await!
        // Early validation juga di PATCH
        if (!isUuid(id)) {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }

        const json = await req.json().catch(() => ({}));
        const parsed = UpdateSchema.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: parsed.error.flatten()},
                {status: 400}
            );
        }

        const {kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan} =
            parsed.data;

        const {rowCount} = await pool.query(
            `UPDATE jabatan
             SET kode_jabatan=$1,
                 nama_jabatan=$2,
                 ikhtisar_jabatan=COALESCE($3, ''),
                 kelas_jabatan=COALESCE($4, ''),
                 prestasi_diharapkan=COALESCE($5, ''),
                 updated_at=NOW()
             WHERE id = $6::uuid`,
            [kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, id]
        );
        if (!rowCount) return NextResponse.json({error: "Not Found, (Dokumen analisis jabatan tidak ditemukan)"}, {status: 404});

        const {rows} = await pool.query(
            `SELECT id, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan
             FROM jabatan
             WHERE id = $1::uuid`,
            [id]
        );
        return NextResponse.json({ok: true, data: rows[0]});
    } catch (e: any) {
        if (e?.code === "22P02") {
            return NextResponse.json({error: "Invalid, id harus UUID"}, {status: 400});
        }
        console.error("PATCH error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

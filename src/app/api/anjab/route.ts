// src/app/api/anjab/route.ts  (POST create jabatan)
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth"; // ← pakai Bearer dari header Authorization

const CreateJabatanSchema = z.object({
    id_jabatan: z.string().trim().min(1).max(50),
    kode_jabatan: z.string().trim().min(1).max(50),
    nama_jabatan: z.string().trim().min(1).max(200),
    ikhtisar_jabatan: z.string().trim().optional().nullable(),
    kelas_jabatan: z.string().trim().optional().nullable(),
    prestasi_diharapkan: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest) {
    try {
        // ====== AUTH: wajib admin ======
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }

        // ====== VALIDASI BODY ======
        const body = await req.json().catch(() => ({}));
        const parsed = CreateJabatanSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: parsed.error.flatten()},
                {status: 400}
            );
        }

        const {
            id_jabatan,
            kode_jabatan,
            nama_jabatan,
            ikhtisar_jabatan = null,
            kelas_jabatan = null,
            prestasi_diharapkan = null,
        } = parsed.data;

        // ====== CEK DUPLIKASI ======
        const existed = await pool.query(
            `SELECT 1
             FROM jabatan
             WHERE id_jabatan = $1 LIMIT 1`,
            [id_jabatan]
        );
        if (existed.rowCount) {
            return NextResponse.json({error: "id_jabatan sudah ada"}, {status: 409});
        }

        // ====== INSERT ======
        const {rows} = await pool.query(
            `INSERT INTO jabatan
             (id_jabatan, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, created_at,
              updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(),
                     NOW()) RETURNING id_jabatan, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan`,
            [
                id_jabatan,
                kode_jabatan,
                nama_jabatan,
                ikhtisar_jabatan,
                kelas_jabatan,
                prestasi_diharapkan,
            ]
        );

        return NextResponse.json({ok: true, data: rows[0]}, {status: 201});
    } catch (e: any) {
        // tangani error auth
        if (e?.message === "UNAUTHORIZED") {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        console.error("[api/anjab][POST] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

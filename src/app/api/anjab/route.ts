// src/app/api/anjab/route.ts
import {NextRequest, NextResponse} from "next/server";
import pool from "@/lib/db";
import {z} from "zod";
import {getUserFromReq, hasRole} from "@/lib/auth";

// util slugify yang konsisten dengan frontend
function toSlug(s: string): string {
    const base =
        (s || "unit")
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 200) || "unit";
    return base;
}

/**
 * Schema create Jabatan
 * No longer requires peta_id or slug - these are removed from jabatan table
 * kode_jabatan is now optional
 */
const CreateJabatanSchema = z.object({
    kode_jabatan: z.string().trim().max(50).optional().nullable(),
    nama_jabatan: z.string().trim().min(1).max(200),
    ikhtisar_jabatan: z.string().trim().optional().nullable(),
    kelas_jabatan: z.string().trim().optional().nullable(),
    prestasi_diharapkan: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest) {
    try {
        // AUTH
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        // VALIDASI BODY
        const body = await req.json().catch(() => ({}));
        const parsed = CreateJabatanSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                {error: "Validasi gagal", detail: parsed.error.flatten()},
                {status: 400}
            );
        }

        const {
            kode_jabatan,
            nama_jabatan,
            ikhtisar_jabatan = null,
            kelas_jabatan = null,
            prestasi_diharapkan = null,
        } = parsed.data;

        // Check for duplicate nama_jabatan
        const duplicateCheck = await pool.query(
            'SELECT id FROM jabatan WHERE LOWER(TRIM(nama_jabatan)) = LOWER(TRIM($1)) LIMIT 1',
            [nama_jabatan]
        );

        if (duplicateCheck.rows.length > 0) {
            return NextResponse.json(
                {error: "Nama jabatan sudah ada, silakan gunakan nama yang berbeda"},
                {status: 400}
            );
        }

        // INSERT
        const {rows} = await pool.query(
            `
                INSERT INTO jabatan
                (kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan,
                 created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, now(), now()) RETURNING
          id,
          kode_jabatan,
          nama_jabatan,
          ikhtisar_jabatan,
          kelas_jabatan,
          prestasi_diharapkan
            `,
            [
                kode_jabatan,
                nama_jabatan,
                ikhtisar_jabatan,
                kelas_jabatan,
                prestasi_diharapkan,
            ]
        );

        return NextResponse.json({ok: true, data: rows[0]}, {status: 201});
    } catch (e: any) {
        if (e?.message === "UNAUTHORIZED") {
            return NextResponse.json({error: "Unauthorized, Silakan login kembali"}, {status: 401});
        }
        console.error("[api/anjab][POST] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

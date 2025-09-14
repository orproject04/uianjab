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
 * - struktur_id: WAJIB (UUID node struktur_organisasi)
 */
const CreateJabatanSchema = z.object({
    kode_jabatan: z.string().trim().min(1).max(50),
    nama_jabatan: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(200),
    ikhtisar_jabatan: z.string().trim().optional().nullable(),
    kelas_jabatan: z.string().trim().optional().nullable(),
    prestasi_diharapkan: z.string().trim().optional().nullable(),
    struktur_id: z.string().uuid(), // ⬅️ WAJIB
});

export async function POST(req: NextRequest) {
    try {
        // AUTH
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
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

        let {
            kode_jabatan,
            nama_jabatan,
            slug,
            ikhtisar_jabatan = null,
            kelas_jabatan = null,
            prestasi_diharapkan = null,
            struktur_id,
        } = parsed.data;

        // siapkan slug (FE sudah kirim format 2 segmen dash)
        slug = toSlug(slug);

        // cek slug duplicate (opsional)
        const dup = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM jabatan WHERE slug = $1) AS exists`,
            [slug]
        );
        if (dup.rows[0]?.exists) {
            return NextResponse.json(
                {error: "Slug sudah digunakan. Gunakan slug lain."},
                {status: 409}
            );
        }

        // ===== Validasi struktur_id: wajib ada di struktur_organisasi =====
        const chk = await pool.query(`SELECT 1
                                      FROM struktur_organisasi
                                      WHERE id = $1 LIMIT 1`, [struktur_id]);
        if (chk.rowCount === 0) {
            // 400 supaya FE bisa menampilkan SweetAlert khusus
            return NextResponse.json(
                {error: "struktur_id tidak valid atau tidak ditemukan"},
                {status: 400}
            );
        }

        // INSERT
        const {rows} = await pool.query(
            `
                INSERT INTO jabatan
                (kode_jabatan, nama_jabatan, slug, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, struktur_id,
                 created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) RETURNING
          id,
          kode_jabatan,
          nama_jabatan,
          slug,
          ikhtisar_jabatan,
          kelas_jabatan,
          prestasi_diharapkan,
          struktur_id
            `,
            [
                kode_jabatan,
                nama_jabatan,
                slug,
                ikhtisar_jabatan,
                kelas_jabatan,
                prestasi_diharapkan,
                struktur_id,
            ]
        );

        return NextResponse.json({ok: true, data: rows[0]}, {status: 201});
    } catch (e: any) {
        if (e?.code === "23505") {
            return NextResponse.json(
                {error: "Slug sudah digunakan. Gunakan slug lain."},
                {status: 409}
            );
        }
        if (e?.message === "UNAUTHORIZED") {
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }
        console.error("[api/anjab][POST] error:", e);
        return NextResponse.json({error: "General Error"}, {status: 500});
    }
}

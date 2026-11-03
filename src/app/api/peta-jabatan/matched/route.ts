import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { resolveVersiId } from "@/lib/versi";

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const versiParam = req.nextUrl.searchParams.get("versi_id");

        let query: string;
        let params: any[] = [];

        if (versiParam === "ALL") {
            // Ambil semua versi jika diminta secara eksplisit
            query = `
                SELECT 
                    pj.id,
                    pj.nama_jabatan,
                    pj.jabatan_id,
                    pj.unit_kerja,
                    pj.versi_id,
                    COALESCE(v.nama_versi, pj.versi_id) AS nama_versi,
                    v.status AS versi_status,
                    j.nama_jabatan as matched_anjab
                FROM peta_jabatan pj
                LEFT JOIN jabatan j ON pj.jabatan_id = j.id
                LEFT JOIN peta_jabatan_versi v ON pj.versi_id = v.id
                WHERE pj.jabatan_id IS NOT NULL AND pj.deleted_at IS NULL
                ORDER BY (v.status = 'AKTIF') DESC, pj.versi_id, pj.nama_jabatan
            `;
        } else {
            // Default: ambil versi tertentu (atau versi AKTIF jika tidak diisi/AKTIF)
            const versi_id = await resolveVersiId(versiParam);
            params = [versi_id];
            query = `
                SELECT 
                    pj.id,
                    pj.nama_jabatan,
                    pj.jabatan_id,
                    pj.unit_kerja,
                    pj.versi_id,
                    COALESCE(v.nama_versi, pj.versi_id) AS nama_versi,
                    v.status AS versi_status,
                    j.nama_jabatan as matched_anjab
                FROM peta_jabatan pj
                LEFT JOIN jabatan j ON pj.jabatan_id = j.id
                LEFT JOIN peta_jabatan_versi v ON pj.versi_id = v.id
                WHERE pj.jabatan_id IS NOT NULL AND pj.deleted_at IS NULL AND pj.versi_id = $1
                ORDER BY pj.nama_jabatan
            `;
        }

        const result = await pool.query(query, params);
        return NextResponse.json(result.rows || []);
    } catch (error: any) {
        console.error("GET /api/peta-jabatan/matched ERROR:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal memuat data" },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Get peta_jabatan yang sudah punya jabatan_id (matched)
        const result = await pool.query(
            `SELECT 
                pj.id,
                pj.nama_jabatan,
                pj.jabatan_id,
                pj.unit_kerja,
                j.nama_jabatan as matched_anjab
            FROM peta_jabatan pj
            LEFT JOIN jabatan j ON pj.jabatan_id = j.id
            WHERE pj.jabatan_id IS NOT NULL
            ORDER BY pj.nama_jabatan`
        );

        return NextResponse.json(result.rows || []);
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Gagal memuat data" },
            { status: 500 }
        );
    }
}

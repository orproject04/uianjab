import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Get peta_jabatan yang belum punya jabatan_id
        const result = await pool.query(
            `SELECT 
                id,
                nama_jabatan,
                jabatan_id
            FROM peta_jabatan
            WHERE jabatan_id IS NULL
            ORDER BY nama_jabatan`
        );

        return NextResponse.json(result.rows || []);
    } catch (error: any) {
        console.error("Error fetching unmatched peta jabatan:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal memuat data" },
            { status: 500 }
        );
    }
}

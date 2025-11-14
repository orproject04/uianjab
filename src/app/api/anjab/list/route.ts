import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        // Ambil semua jabatan yang sudah ada anjab
        const result = await pool.query(
            `SELECT 
                id,
                nama_jabatan,
                kode_jabatan,
                kelas_jabatan,
                created_at,
                updated_at
            FROM jabatan
            WHERE nama_jabatan IS NOT NULL
            ORDER BY updated_at DESC`
        );

        return NextResponse.json(result.rows || []);
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Gagal memuat data" },
            { status: 500 }
        );
    }
}

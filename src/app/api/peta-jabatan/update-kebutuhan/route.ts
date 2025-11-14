import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// POST - Update kebutuhan_pegawai di peta_jabatan
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { peta_jabatan_id, kebutuhan_pegawai } = body;

        if (!peta_jabatan_id) {
            return NextResponse.json({
                success: false,
                error: "peta_jabatan_id required"
            }, { status: 400 });
        }

        // Update peta_jabatan
        const result = await pool.query(
            `UPDATE peta_jabatan 
             SET kebutuhan_pegawai = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [kebutuhan_pegawai, peta_jabatan_id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Peta jabatan not found"
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error: any) {
        console.error("Update kebutuhan_pegawai error:", error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

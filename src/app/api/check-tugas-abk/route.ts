import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const countResult = await pool.query(
            "SELECT COUNT(*) as total FROM tugas_pokok_abk"
        );
        
        const sampleResult = await pool.query(
            `SELECT 
                tpa.id,
                tpa.peta_jabatan_id,
                tpa.tugas_pokok_id,
                tpa.jumlah_hasil,
                tpa.waktu_penyelesaian_jam,
                tpa.waktu_efektif,
                tpa.kebutuhan_pegawai,
                tp.uraian,
                pj.nama_jabatan
             FROM tugas_pokok_abk tpa
             LEFT JOIN tugas_pokok tp ON tp.id = tpa.tugas_pokok_id
             LEFT JOIN peta_jabatan pj ON pj.id = tpa.peta_jabatan_id
             LIMIT 5`
        );

        return NextResponse.json({
            success: true,
            total: parseInt(countResult.rows[0].total),
            sample: sampleResult.rows
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

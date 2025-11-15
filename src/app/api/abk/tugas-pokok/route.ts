import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET - Ambil data tugas_pokok_abk berdasarkan peta_jabatan_id
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const petaJabatanId = searchParams.get("peta_jabatan_id");

        if (!petaJabatanId) {
            return NextResponse.json({
                success: false,
                error: "peta_jabatan_id required"
            }, { status: 400 });
        }

        const result = await pool.query(
            `SELECT 
                tpa.id,
                tpa.peta_jabatan_id,
                tpa.tugas_pokok_id,
                tpa.jumlah_hasil,
                tpa.waktu_penyelesaian_jam,
                tpa.waktu_efektif,
                tpa.kebutuhan_pegawai,
                tp.uraian_tugas as uraian,
                tp.hasil_kerja,
                NULL as tp_jumlah_hasil,
                null as satuan_hasil,
                NULL as tp_waktu_penyelesaian
             FROM tugas_pokok_abk tpa
             INNER JOIN tugas_pokok tp ON tp.id = tpa.tugas_pokok_id
             WHERE tpa.peta_jabatan_id = $1
             ORDER BY tp.nomor_tugas`,
            [petaJabatanId]
        );

        return NextResponse.json({
            success: true,
            data: result.rows
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// POST - Buat atau update data tugas_pokok_abk
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            peta_jabatan_id,
            tugas_pokok_id,
            jumlah_hasil,
            waktu_penyelesaian_jam,
            waktu_efektif,
            kebutuhan_pegawai
        } = body;

        if (!peta_jabatan_id || !tugas_pokok_id) {
            return NextResponse.json({
                success: false,
                error: "peta_jabatan_id and tugas_pokok_id required"
            }, { status: 400 });
        }

        // Upsert: insert atau update jika sudah ada
        const result = await pool.query(
            `INSERT INTO tugas_pokok_abk 
                (peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (peta_jabatan_id, tugas_pokok_id) 
             DO UPDATE SET
                jumlah_hasil = EXCLUDED.jumlah_hasil,
                waktu_penyelesaian_jam = EXCLUDED.waktu_penyelesaian_jam,
                waktu_efektif = EXCLUDED.waktu_efektif,
                kebutuhan_pegawai = EXCLUDED.kebutuhan_pegawai,
                updated_at = now()
             RETURNING *`,
            [peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai]
        );

        return NextResponse.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// PUT - Update data tugas_pokok_abk by ID
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            id,
            jumlah_hasil,
            waktu_penyelesaian_jam,
            waktu_efektif,
            kebutuhan_pegawai
        } = body;

        if (!id) {
            return NextResponse.json({
                success: false,
                error: "id required"
            }, { status: 400 });
        }

        const result = await pool.query(
            `UPDATE tugas_pokok_abk 
             SET jumlah_hasil = $2,
                 waktu_penyelesaian_jam = $3,
                 waktu_efektif = $4,
                 kebutuhan_pegawai = $5,
                 updated_at = now()
             WHERE id = $1
             RETURNING *`,
            [id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Record not found"
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// DELETE - Hapus data tugas_pokok_abk
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({
                success: false,
                error: "id required"
            }, { status: 400 });
        }

        const result = await pool.query(
            `DELETE FROM tugas_pokok_abk WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Record not found"
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

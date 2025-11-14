import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, nama_jabatan, kode_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: "ID jabatan diperlukan" },
                { status: 400 }
            );
        }

        if (!nama_jabatan || !kode_jabatan) {
            return NextResponse.json(
                { success: false, error: "Nama jabatan dan kode jabatan wajib diisi" },
                { status: 400 }
            );
        }

        console.log("Updating jabatan:", id);

        const result = await pool.query(
            `UPDATE jabatan 
             SET nama_jabatan = $1, 
                 kode_jabatan = $2, 
                 ikhtisar_jabatan = $3, 
                 kelas_jabatan = $4, 
                 prestasi_diharapkan = $5,
                 updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [nama_jabatan, kode_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json(
                { success: false, error: "Jabatan tidak ditemukan" },
                { status: 404 }
            );
        }

        console.log("Jabatan updated successfully:", result.rows[0].nama_jabatan);

        return NextResponse.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error: any) {
        console.error("Error updating jabatan:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Terjadi kesalahan server" },
            { status: 500 }
        );
    }
}

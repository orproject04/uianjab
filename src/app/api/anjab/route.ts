import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
    try {
        const query = `
            SELECT
                j.nama_jabatan,
                json_build_object(
                        'JPT Utama', uk.jpt_utama,
                        'JPT Madya', uk.jpt_madya,
                        'JPT Pratama', uk.jpt_pratama,
                        'Administrator', uk.administrator,
                        'Pengawas', uk.pengawas,
                        'Pelaksana', uk.pelaksana,
                        'Jabatan Fungsional', uk.jabatan_fungsional
                ) AS unit_kerja,
                json_build_object(
                        'pendidikan_formal', kj.pendidikan_formal,
                        'diklat_penjenjangan', kj.diklat_penjenjangan,
                        'diklat_teknis', kj.diklat_teknis,
                        'diklat_fungsional', kj.diklat_fungsional,
                        'pengalaman_kerja', kj.pengalaman_kerja
                ) AS kualifikasi_jabatan
            FROM jabatan j
                     LEFT JOIN unit_kerja uk ON uk.id_jabatan = j.id_jabatan
                     LEFT JOIN kualifikasi_jabatan kj ON kj.id_jabatan = j.id_jabatan
                LIMIT 1;
        `;

        const result = await pool.query(query);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0], { status: 200 });
    } catch (err) {
        console.error('DB error:', err);
        return NextResponse.json({ error: 'Gagal mengambil data dari database' }, { status: 500 });
    }
}

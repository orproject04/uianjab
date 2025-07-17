// src/app/api/upload-json/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { items } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ message: 'Data kosong atau tidak valid' }, { status: 400 });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const item of items) {
                const jabatan = item['NAMA JABATAN'];
                const unitKerja = item['UNIT KERJA'];
                const kualifikasiJabatan = item['KUALIFIKASI JABATAN'];
                const tugasPokok = item['TUGAS POKOK'];

                if (!jabatan || typeof unitKerja !== 'object' || typeof kualifikasiJabatan !== 'object') continue;

                // Insert ke tabel anjab
                const insertAnjab = `
                    INSERT INTO anjab (nama_jabatan, unit_kerja, kualifikasi_jabatan)
                    VALUES ($1, $2, $3)
                        RETURNING id
                `;

                const res = await client.query(insertAnjab, [
                    jabatan,
                    JSON.stringify(unitKerja),
                    JSON.stringify(kualifikasiJabatan),
                ]);

                const anjabId = res.rows[0].id;

                // Insert ke tabel tugas_pokok
                if (Array.isArray(tugasPokok)) {
                    const insertTugas = `
                        INSERT INTO tugas_pokok
                        (anjab_id, no, uraian_tugas, hasil_kerja, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai)
                        VALUES
                            ($1, $2, $3, $4, $5, $6, $7, $8)
                    `;

                    for (const tugas of tugasPokok) {
                        await client.query(insertTugas, [
                            anjabId,
                            tugas['NO'] || '',
                            tugas['URAIAN TUGAS'] || '',
                            tugas['HASIL KERJA'] || '',
                            tugas['JUMLAH HASIL'] || '',
                            tugas['WAKTU PENYELESAIAN (JAM)'] || '',
                            tugas['WAKTU EFEKTIF'] || '',
                            tugas['KEBUTUHAN PEGAWAI'] || '',
                        ]);
                    }
                }
            }

            await client.query('COMMIT');
            return NextResponse.json({ message: 'Semua data berhasil disimpan' }, { status: 200 });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Rollback karena error:', err);
            return NextResponse.json({ message: 'Gagal menyimpan data' }, { status: 500 });
        } finally {
            client.release();
        }

    } catch (err) {
        console.error(err);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

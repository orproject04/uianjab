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
                const tugasPokok = item['TUGAS POKOK'];

                if (!jabatan || !tugasPokok || !Array.isArray(tugasPokok)) {
                    continue; // Skip jika data tidak lengkap
                }

                // Insert ke tabel jabatan
                const insertJabatanQuery = `
                    INSERT INTO jabatan (nama_jabatan, created_at, updated_at)
                    VALUES ($1, NOW(), NOW())
                    RETURNING id_jabatan
                `;

                const result = await client.query(insertJabatanQuery, [jabatan]);
                const anjabId = result.rows[0].id_jabatan;

                // Insert ke tabel tugas_pokok
                const insertTugasQuery = `
                    INSERT INTO tugas_pokok (
                        id_jabatan,
                        nomor_tugas,
                        uraian_tugas,
                        hasil_kerja,
                        jumlah_hasil,
                        waktu_penyelesaian_jam,
                        waktu_efektif,
                        kebutuhan_pegawai,
                        created_at,
                        updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
                    )
                `;

                for (const tugas of tugasPokok) {
                    await client.query(insertTugasQuery, [
                        anjabId,
                        parseInt(tugas['NO']) || null,
                        tugas['URAIAN TUGAS']?.toString() || '',
                        Array.isArray(tugas['HASIL KERJA'])
                            ? tugas['HASIL KERJA']
                            : tugas['HASIL KERJA']
                                ? [tugas['HASIL KERJA'].toString()]
                                : [],
                        parseInt(tugas['JUMLAH HASIL']) || null,
                        parseInt(tugas['WAKTU PENYELESAIAN (JAM)']) || null,
                        parseInt(tugas['WAKTU EFEKTIF']) || null,
                        parseInt(tugas['KEBUTUHAN PEGAWAI']) || null
                    ]);
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
        console.error('Request Error:', err);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

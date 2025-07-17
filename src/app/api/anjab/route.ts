import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
    try {
        const result = await pool.query('SELECT nama_jabatan, unit_kerja FROM anjab LIMIT 1');

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0], { status: 200 });
    } catch (err) {
        console.error('DB error:', err);
        return NextResponse.json({ error: 'Gagal mengambil data dari database' }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';

// GET - Get list of jabatan names and unit kerja for suggestions
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'jabatan'; // 'jabatan' | 'unit_kerja'

    if (type === 'unit_kerja') {
      // Get distinct unit_kerja from peta_jabatan
      const result = await pool.query(
        `SELECT DISTINCT unit_kerja
         FROM peta_jabatan
         WHERE unit_kerja IS NOT NULL
           AND unit_kerja <> ''
           AND ($1 = '' OR unit_kerja ILIKE '%' || $1 || '%')
         ORDER BY unit_kerja
         LIMIT 50`,
        [q]
      );
      return NextResponse.json({ data: result.rows.map((r: any) => r.unit_kerja) });
    } else {
      // Get nama_jabatan from jabatan table
      const result = await pool.query(
        `SELECT DISTINCT nama_jabatan
         FROM jabatan
         WHERE nama_jabatan IS NOT NULL
           AND nama_jabatan <> ''
           AND ($1 = '' OR nama_jabatan ILIKE '%' || $1 || '%')
         ORDER BY nama_jabatan
         LIMIT 30`,
        [q]
      );
      return NextResponse.json({ data: result.rows.map((r: any) => r.nama_jabatan) });
    }
  } catch (error: any) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}

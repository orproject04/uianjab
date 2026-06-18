import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';

type JabatanSuggestion = {
  value: string;
  label: string;
  unit_kerja: string;
  peta_jabatan_id: string;
};

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
    const unitKerja = searchParams.get('unit_kerja') || '';

    if (type === 'unit_kerja') {
      // Get distinct unit_kerja from peta_jabatan
      const result = await pool.query(
        `SELECT DISTINCT unit_kerja
         FROM peta_jabatan
         WHERE unit_kerja IS NOT NULL
           AND unit_kerja <> ''
           AND ($1 = '' OR unit_kerja ILIKE '%' || $1 || '%')
         ORDER BY unit_kerja
         LIMIT 500`,
        [q]
      );
      return NextResponse.json({ data: result.rows.map((r: { unit_kerja: string }) => r.unit_kerja) });
    } else {
      if (!unitKerja.trim()) {
        return NextResponse.json({ data: [] });
      }

      const rootTypeResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM peta_jabatan
         WHERE unit_kerja IS NOT NULL
           AND unit_kerja <> ''
           AND LOWER(TRIM(unit_kerja)) = LOWER(TRIM($1))
           AND jenis_jabatan = 'ESELON III / Administrator'`,
        [unitKerja]
      );

      const hasAdministratorRoot = Number(rootTypeResult.rows[0]?.count || '0') > 0;

      let result;
      if (hasAdministratorRoot) {
        // Return descendant jabatan under the selected unit kerja.
        // Label is kept simple: "Nama Jabatan - Unit Kerja".
        result = await pool.query<JabatanSuggestion>(
          `WITH RECURSIVE roots AS (
             SELECT id, nama_jabatan, parent_id, unit_kerja
             FROM peta_jabatan
             WHERE unit_kerja IS NOT NULL
               AND unit_kerja <> ''
               AND LOWER(TRIM(unit_kerja)) = LOWER(TRIM($1))
               AND jenis_jabatan = 'ESELON III / Administrator'
           ), tree AS (
             SELECT
               r.id,
               r.nama_jabatan,
               r.parent_id,
               r.unit_kerja,
               0 AS depth
             FROM roots r

             UNION ALL

             SELECT
               c.id,
               c.nama_jabatan,
               c.parent_id,
               c.unit_kerja,
               t.depth + 1
             FROM peta_jabatan c
             JOIN tree t ON c.parent_id = t.id
           )
           SELECT DISTINCT
             t.id AS peta_jabatan_id,
             t.nama_jabatan AS value,
             t.nama_jabatan || ' - ' || COALESCE(NULLIF(t.unit_kerja, ''), $1) AS label,
             COALESCE(NULLIF(t.unit_kerja, ''), $1) AS unit_kerja
           FROM tree t
            WHERE t.depth >= 0
             AND t.nama_jabatan IS NOT NULL
             AND t.nama_jabatan <> ''
             AND ($2 = '' OR t.nama_jabatan ILIKE '%' || $2 || '%' OR (t.nama_jabatan || ' - ' || COALESCE(NULLIF(t.unit_kerja, ''), $1)) ILIKE '%' || $2 || '%')
           ORDER BY label
           LIMIT 500`,
          [unitKerja, q]
        );
      } else {
        // Fallback: direct names within the selected unit kerja
        result = await pool.query<JabatanSuggestion>(
          `SELECT DISTINCT
             id AS peta_jabatan_id,
             nama_jabatan AS value,
             nama_jabatan || ' - ' || unit_kerja AS label,
             unit_kerja
           FROM peta_jabatan
           WHERE nama_jabatan IS NOT NULL
             AND nama_jabatan <> ''
             AND unit_kerja IS NOT NULL
             AND unit_kerja <> ''
             AND LOWER(TRIM(unit_kerja)) = LOWER(TRIM($1))
             AND ($2 = '' OR nama_jabatan ILIKE '%' || $2 || '%' OR (nama_jabatan || ' - ' || unit_kerja) ILIKE '%' || $2 || '%')
           ORDER BY label
           LIMIT 500`,
          [unitKerja, q]
        );
      }

      return NextResponse.json({ data: result.rows });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch suggestions';
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

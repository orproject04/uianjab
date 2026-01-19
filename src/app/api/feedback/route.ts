import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';

// GET - List feedback records
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query: string;
    let params: any[] = [];

    // If admin, show all feedback. Otherwise, only show user's own feedback
    if (user.role === 'admin') {
      query = `
        SELECT 
          f.id, 
          f.user_id,
          f.nama_jabatan, 
          f.unit_kerja, 
          f.usulan_perbaikan, 
          f.created_at,
          u.full_name as user_name,
          u.email as user_email
        FROM feedback f
        LEFT JOIN user_anjab u ON f.user_id = u.id
        ORDER BY f.created_at DESC
      `;
    } else {
      query = `
        SELECT 
          f.id, 
          f.user_id,
          f.nama_jabatan, 
          f.unit_kerja, 
          f.usulan_perbaikan, 
          f.created_at,
          u.full_name as user_name,
          u.email as user_email
        FROM feedback f
        LEFT JOIN user_anjab u ON f.user_id = u.id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC
      `;
      params = [user.id];
    }

    const result = await pool.query(query, params);

    return NextResponse.json({ data: result.rows });
  } catch (error: any) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}

// POST - Create new feedback
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { nama_jabatan, unit_kerja, usulan_perbaikan } = body;

    // Validation
    if (!nama_jabatan || !unit_kerja || !usulan_perbaikan) {
      return NextResponse.json(
        { error: 'Nama jabatan, unit kerja, dan usulan perbaikan harus diisi' },
        { status: 400 }
      );
    }

    if (nama_jabatan.trim().length === 0) {
      return NextResponse.json(
        { error: 'Nama jabatan tidak boleh kosong' },
        { status: 400 }
      );
    }

    if (unit_kerja.trim().length === 0) {
      return NextResponse.json(
        { error: 'Unit kerja tidak boleh kosong' },
        { status: 400 }
      );
    }

    if (usulan_perbaikan.trim().length === 0) {
      return NextResponse.json(
        { error: 'Usulan perbaikan tidak boleh kosong' },
        { status: 400 }
      );
    }

    // Insert feedback
    const result = await pool.query(
      `INSERT INTO feedback (user_id, nama_jabatan, unit_kerja, usulan_perbaikan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, user_id, nama_jabatan, unit_kerja, usulan_perbaikan, created_at`,
      [user.id, nama_jabatan.trim(), unit_kerja.trim(), usulan_perbaikan.trim()]
    );

    return NextResponse.json(
      { 
        message: 'Usulan perbaikan berhasil dikirim', 
        data: result.rows[0] 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create feedback' },
      { status: 500 }
    );
  }
}

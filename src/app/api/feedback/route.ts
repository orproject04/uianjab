import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';

// Ensure required columns exist — run immediately at module load
const _migration = Promise.all([
  pool.query(`
    ALTER TABLE feedback
    ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb
  `),
  pool.query(`
    ALTER TABLE feedback
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `),
]).catch(() => {/* columns already exist */});

// GET - List feedback records
export async function GET(req: NextRequest) {
  try {
    // Wait for migration in case module just loaded
    await _migration.catch(() => {});

    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query: string;
    let params: (string | number | null)[] = [];

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
          COALESCE(f.updated_at, f.created_at) as updated_at,
          f.status,
          f.admin_notes,
          f.status_history,
          f.rating,
          f.rating_comment,
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
          COALESCE(f.updated_at, f.created_at) as updated_at,
          f.status,
          f.admin_notes,
          f.status_history,
          f.rating,
          f.rating_comment,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch feedback';
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: message },
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

    const matchedJabatan = await pool.query(
      `SELECT nama_jabatan, unit_kerja
       FROM peta_jabatan
       WHERE LOWER(TRIM(nama_jabatan)) = LOWER(TRIM($1))
         AND LOWER(TRIM(unit_kerja)) = LOWER(TRIM($2))
       LIMIT 1`,
      [nama_jabatan.trim(), unit_kerja.trim()]
    );

    if (matchedJabatan.rowCount === 0) {
      return NextResponse.json(
        { error: 'Nama jabatan harus dipilih dari unit kerja yang tersedia' },
        { status: 400 }
      );
    }

    const canonicalNamaJabatan = matchedJabatan.rows[0].nama_jabatan;
    const canonicalUnitKerja = matchedJabatan.rows[0].unit_kerja;

    // Insert feedback
    const result = await pool.query(
      `INSERT INTO feedback (user_id, nama_jabatan, unit_kerja, usulan_perbaikan, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'diusulkan', NOW(), NOW())
       RETURNING id, user_id, nama_jabatan, unit_kerja, usulan_perbaikan, status, created_at`,
      [user.id, canonicalNamaJabatan, canonicalUnitKerja, usulan_perbaikan.trim()]
    );

    return NextResponse.json(
      { 
        message: 'Usulan perbaikan berhasil dikirim', 
        data: result.rows[0] 
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create feedback';
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// PUT - Update feedback status or rating
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromReq(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, admin_notes, rating, rating_comment, mark_selesai } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Check existing feedback
    const existing = await pool.query('SELECT * FROM feedback WHERE id = $1', [id]);
    if (existing.rowCount === 0) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    const currentFeedback = existing.rows[0];

    // If regular user trying to update status or admin_notes
    if (user.role !== 'admin') {
      if (status !== undefined || admin_notes !== undefined || mark_selesai) {
         return NextResponse.json({ error: 'Unauthorized to update status' }, { status: 403 });
      }
      if (currentFeedback.user_id !== user.id) {
         return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    // ---- Admin status update logic ----
    if (user.role === 'admin' && (status !== undefined || mark_selesai)) {
      // Lock: cannot change if already diterima or ditolak
      const lockedStatuses = ['diterima', 'ditolak'];
      if (lockedStatuses.includes(currentFeedback.status)) {
        return NextResponse.json(
          { error: `Usulan dengan status "${currentFeedback.status}" tidak dapat diubah lagi` },
          { status: 400 }
        );
      }

      // Determine new status
      const newStatus = mark_selesai ? 'diterima' : status;

      // Validate allowed status transitions
      const allowedStatuses = ['ditindaklanjuti', 'ditolak', 'diterima'];
      if (!allowedStatuses.includes(newStatus)) {
        return NextResponse.json(
          { error: 'Status tidak valid. Admin hanya dapat mengubah ke: ditindaklanjuti, ditolak, atau diterima (selesai)' },
          { status: 400 }
        );
      }

      // Build new history entry
      const historyEntry: Record<string, unknown> = {
        status: newStatus,
        changed_at: new Date().toISOString(),
        changed_by: user.full_name || user.email || 'Admin',
      };
      if (admin_notes?.trim()) {
        historyEntry.notes = admin_notes.trim();
      }

      // Append to existing history
      const existingHistory: unknown[] = Array.isArray(currentFeedback.status_history)
        ? currentFeedback.status_history
        : [];
      const newHistory = [...existingHistory, historyEntry];

      // Update status, admin_notes (latest), and history
      const result = await pool.query(
        `UPDATE feedback 
         SET status = $1, admin_notes = $2, status_history = $3::jsonb, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [newStatus, admin_notes?.trim() || currentFeedback.admin_notes || null, JSON.stringify(newHistory), id]
      );

      return NextResponse.json({ message: 'Status usulan berhasil diperbarui', data: result.rows[0] });
    }

    // ---- Rating update logic (regular user) ----
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (rating !== undefined) {
      updates.push(`rating = $${idx++}`);
      values.push(rating);
    }
    if (rating_comment !== undefined) {
      updates.push(`rating_comment = $${idx++}`);
      values.push(rating_comment);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE feedback SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);

    return NextResponse.json({ message: 'Feedback updated', data: result.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update feedback';
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

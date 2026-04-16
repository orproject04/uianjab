DROP TABLE IF EXISTS feedback CASCADE;

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
  REFERENCES user_anjab(id) ON DELETE CASCADE,

  nama_jabatan VARCHAR(500) NOT NULL,
  unit_kerja VARCHAR(500) NOT NULL,
  usulan_perbaikan TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- ===== FIELD BARU =====
  status VARCHAR(50) DEFAULT 'diusulkan',
  admin_notes TEXT,
  rating INTEGER,
  rating_comment TEXT,
  status_history JSONB NOT NULL DEFAULT '[]'
);

-- ========================================
-- INDEX
-- ========================================
CREATE INDEX IF NOT EXISTS idx_feedback_user_id 
ON feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at 
ON feedback(created_at DESC);

-- ========================================
-- COMMENT
-- ========================================
COMMENT ON TABLE feedback IS 'Tabel untuk menyimpan usulan perbaikan dokumen anjab dari user';

COMMENT ON COLUMN feedback.id IS 'Primary key UUID';
COMMENT ON COLUMN feedback.user_id IS 'Foreign key ke tabel user_anjab';
COMMENT ON COLUMN feedback.nama_jabatan IS 'Nama jabatan yang ingin diperbaiki';
COMMENT ON COLUMN feedback.unit_kerja IS 'Unit kerja dari jabatan tersebut';
COMMENT ON COLUMN feedback.usulan_perbaikan IS 'Usulan perbaikan dokumen anjab (text panjang)';
COMMENT ON COLUMN feedback.created_at IS 'Waktu pembuatan record';
COMMENT ON COLUMN feedback.updated_at IS 'Waktu update terakhir record';

-- COMMENT tambahan (field baru)
COMMENT ON COLUMN feedback.status IS 'Status usulan (diusulkan, ditindaklanjuti, diterima, ditolak)';
COMMENT ON COLUMN feedback.admin_notes IS 'Catatan dari admin';
COMMENT ON COLUMN feedback.rating IS 'Rating dari user (1-5)';
COMMENT ON COLUMN feedback.rating_comment IS 'Komentar rating dari user';
COMMENT ON COLUMN feedback.status_history IS 'Riwayat perubahan status dalam format JSON';
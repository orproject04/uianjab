/* ============================================================================
   EXTENSIONS
   ============================================================================ */
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/* ============================================================================
   HELPER: touch updated_at (tabel itu sendiri)
   ============================================================================ */
CREATE OR REPLACE FUNCTION trg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END$$;

/* ============================================================================
   HELPER: sentuh parent jabatan.updated_at saat tabel anak berubah
   ============================================================================ */
CREATE OR REPLACE FUNCTION touch_parent_jabatan()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jabatan
     SET updated_at = now()
   WHERE id = COALESCE(NEW.jabatan_id, OLD.jabatan_id);
  RETURN NULL;
END$$;

CREATE OR REPLACE FUNCTION touch_parent_jabatan_from_tahapan()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_jabatan_id uuid;
BEGIN
  SELECT jabatan_id INTO v_jabatan_id
  FROM tugas_pokok
  WHERE id = COALESCE(NEW.tugas_id, OLD.tugas_id);

  IF v_jabatan_id IS NOT NULL THEN
    UPDATE jabatan SET updated_at = now() WHERE id = v_jabatan_id;
  END IF;

  RETURN NULL;
END$$;

/* ============================================================================
   1) AUTH (UUID)
   ============================================================================ */
CREATE TABLE IF NOT EXISTS user_anjab (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text UNIQUE NOT NULL,
  password_hash     text NOT NULL,
  full_name         text,
  is_email_verified boolean NOT NULL DEFAULT false,
  role              text NOT NULL DEFAULT 'user',  -- 'admin' | 'editor' | 'user'
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS user_anjab_touch ON user_anjab;
CREATE TRIGGER user_anjab_touch
BEFORE UPDATE ON user_anjab
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

CREATE TABLE IF NOT EXISTS user_session (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES user_anjab(id) ON DELETE CASCADE,
  refresh_token_hash varchar(64),
  last_used_at       timestamptz,
  is_revoked         boolean NOT NULL DEFAULT false,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_session_user         ON user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_user_session_refresh_hash ON user_session(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_session_expires      ON user_session(expires_at);

CREATE TABLE IF NOT EXISTS email_verification (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_anjab(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE TABLE IF NOT EXISTS password_reset (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_anjab(id) ON DELETE CASCADE,
  token_hash varchar(64),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_user       ON password_reset(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires    ON password_reset(expires_at);

/* ============================================================================
   2) STRUKTUR ORGANISASI
   ============================================================================ */
CREATE TABLE IF NOT EXISTS struktur_organisasi (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NULL REFERENCES struktur_organisasi(id) ON DELETE CASCADE,
  nama_jabatan text NOT NULL,
  unit_kerja   text,
  slug         text NOT NULL,
  level        int  NOT NULL DEFAULT 0,
  order_index  int  NOT NULL DEFAULT 0,
  kebutuhan_pegawai  int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_so_parent_slug UNIQUE (parent_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_so_parent      ON struktur_organisasi(parent_id);
CREATE INDEX IF NOT EXISTS idx_so_parent_ord  ON struktur_organisasi(parent_id, order_index);
CREATE INDEX IF NOT EXISTS idx_so_level       ON struktur_organisasi(level);

DROP TRIGGER IF EXISTS so_touch ON struktur_organisasi;
CREATE TRIGGER so_touch
BEFORE UPDATE ON struktur_organisasi
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

CREATE OR REPLACE FUNCTION so_set_level()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_parent_level int;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.level := 0;
  ELSE
    SELECT level INTO v_parent_level FROM struktur_organisasi WHERE id = NEW.parent_id;
    NEW.level := COALESCE(v_parent_level, -1) + 1;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS so_set_level_ins ON struktur_organisasi;
CREATE TRIGGER so_set_level_ins
BEFORE INSERT ON struktur_organisasi
FOR EACH ROW EXECUTE FUNCTION so_set_level();

DROP TRIGGER IF EXISTS so_set_level_upd ON struktur_organisasi;
CREATE TRIGGER so_set_level_upd
BEFORE UPDATE OF parent_id ON struktur_organisasi
FOR EACH ROW EXECUTE FUNCTION so_set_level();

/* ============================================================================
   3) DOMAIN ANJAB
   ============================================================================ */
CREATE TABLE IF NOT EXISTS jabatan (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_jabatan        text,
  nama_jabatan        text NOT NULL,
  ikhtisar_jabatan    text,
  kelas_jabatan       text,
  prestasi_diharapkan text,
  slug                text,
  struktur_id         uuid REFERENCES struktur_organisasi(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS jabatan_touch ON jabatan;
CREATE TRIGGER jabatan_touch
BEFORE UPDATE ON jabatan
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

/* ---------------- anak-anak ---------------- */

CREATE TABLE IF NOT EXISTS unit_kerja (
  id                  SERIAL PRIMARY KEY,
  jabatan_id          uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  jpt_utama           text,
  jpt_madya           text,
  jpt_pratama         text,
  administrator       text,
  pengawas            text,
  pelaksana           text,
  jabatan_fungsional  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS unit_kerja_touch ON unit_kerja;
CREATE TRIGGER unit_kerja_touch
BEFORE UPDATE ON unit_kerja
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_unit ON unit_kerja;
CREATE TRIGGER trg_touch_parent_unit
AFTER INSERT OR UPDATE OR DELETE ON unit_kerja
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS kualifikasi_jabatan (
  id                  SERIAL PRIMARY KEY,
  jabatan_id          uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  pendidikan_formal   text[],
  diklat_penjenjangan text[],
  diklat_teknis       text[],
  diklat_fungsional   text[],
  pengalaman_kerja    text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS kualifikasi_jabatan_touch ON kualifikasi_jabatan;
CREATE TRIGGER kualifikasi_jabatan_touch
BEFORE UPDATE ON kualifikasi_jabatan
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_kualifikasi ON kualifikasi_jabatan;
CREATE TRIGGER trg_touch_parent_kualifikasi
AFTER INSERT OR UPDATE OR DELETE ON kualifikasi_jabatan
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS tugas_pokok (
  id                       SERIAL PRIMARY KEY,
  jabatan_id               uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  nomor_tugas              int,
  uraian_tugas             text,
  hasil_kerja              text[],
  jumlah_hasil             int,
  waktu_penyelesaian_jam   int,
  waktu_efektif            int,
  kebutuhan_pegawai        numeric(10,4),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS tugas_pokok_touch ON tugas_pokok;
CREATE TRIGGER tugas_pokok_touch
BEFORE UPDATE ON tugas_pokok
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_tugas ON tugas_pokok;
CREATE TRIGGER trg_touch_parent_tugas
AFTER INSERT OR UPDATE OR DELETE ON tugas_pokok
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS tahapan_uraian_tugas (
  id            SERIAL PRIMARY KEY,
  tugas_id      INT REFERENCES tugas_pokok(id) ON DELETE CASCADE,
  jabatan_id    uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  tahapan       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS tahapan_uraian_tugas_touch ON tahapan_uraian_tugas;
CREATE TRIGGER tahapan_uraian_tugas_touch
BEFORE UPDATE ON tahapan_uraian_tugas
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_tahapan ON tahapan_uraian_tugas;
CREATE TRIGGER trg_touch_parent_tahapan
AFTER INSERT OR UPDATE OR DELETE ON tahapan_uraian_tugas
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan_from_tahapan();

CREATE TABLE IF NOT EXISTS hasil_kerja (
  id            SERIAL PRIMARY KEY,
  jabatan_id    uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  hasil_kerja   text[],
  satuan_hasil  text[],
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS hasil_kerja_touch ON hasil_kerja;
CREATE TRIGGER hasil_kerja_touch
BEFORE UPDATE ON hasil_kerja
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_hasil ON hasil_kerja;
CREATE TRIGGER trg_touch_parent_hasil
AFTER INSERT OR UPDATE OR DELETE ON hasil_kerja
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS bahan_kerja (
  id                          SERIAL PRIMARY KEY,
  jabatan_id                  uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  bahan_kerja                 text[],
  penggunaan_dalam_tugas      text[],
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS bahan_kerja_touch ON bahan_kerja;
CREATE TRIGGER bahan_kerja_touch
BEFORE UPDATE ON bahan_kerja
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_bahan ON bahan_kerja;
CREATE TRIGGER trg_touch_parent_bahan
AFTER INSERT OR UPDATE OR DELETE ON bahan_kerja
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS perangkat_kerja (
  id                          SERIAL PRIMARY KEY,
  jabatan_id                  uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  perangkat_kerja             text[],
  penggunaan_untuk_tugas      text[],
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS perangkat_kerja_touch ON perangkat_kerja;
CREATE TRIGGER perangkat_kerja_touch
BEFORE UPDATE ON perangkat_kerja
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_perangkat ON perangkat_kerja;
CREATE TRIGGER trg_touch_parent_perangkat
AFTER INSERT OR UPDATE OR DELETE ON perangkat_kerja
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS tanggung_jawab (
  id                    SERIAL PRIMARY KEY,
  jabatan_id            uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  uraian_tanggung_jawab text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS tanggung_jawab_touch ON tanggung_jawab;
CREATE TRIGGER tanggung_jawab_touch
BEFORE UPDATE ON tanggung_jawab
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_tanggung ON tanggung_jawab;
CREATE TRIGGER trg_touch_parent_tanggung
AFTER INSERT OR UPDATE OR DELETE ON tanggung_jawab
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS wewenang (
  id               SERIAL PRIMARY KEY,
  jabatan_id       uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  uraian_wewenang  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS wewenang_touch ON wewenang;
CREATE TRIGGER wewenang_touch
BEFORE UPDATE ON wewenang
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_wewenang ON wewenang;
CREATE TRIGGER trg_touch_parent_wewenang
AFTER INSERT OR UPDATE OR DELETE ON wewenang
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS korelasi_jabatan (
  id                     SERIAL PRIMARY KEY,
  jabatan_id             uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  jabatan_terkait        text,
  unit_kerja_instansi    text,
  dalam_hal              text[],
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS korelasi_jabatan_touch ON korelasi_jabatan;
CREATE TRIGGER korelasi_jabatan_touch
BEFORE UPDATE ON korelasi_jabatan
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_korelasi ON korelasi_jabatan;
CREATE TRIGGER trg_touch_parent_korelasi
AFTER INSERT OR UPDATE OR DELETE ON korelasi_jabatan
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS kondisi_lingkungan_kerja (
  id          SERIAL PRIMARY KEY,
  jabatan_id  uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  aspek       text,
  faktor      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS kondisi_lingkungan_kerja_touch ON kondisi_lingkungan_kerja;
CREATE TRIGGER kondisi_lingkungan_kerja_touch
BEFORE UPDATE ON kondisi_lingkungan_kerja
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_klk ON kondisi_lingkungan_kerja;
CREATE TRIGGER trg_touch_parent_klk
AFTER INSERT OR UPDATE OR DELETE ON kondisi_lingkungan_kerja
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS risiko_bahaya (
  id          SERIAL PRIMARY KEY,
  jabatan_id  uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  nama_risiko text,
  penyebab    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS risiko_bahaya_touch ON risiko_bahaya;
CREATE TRIGGER risiko_bahaya_touch
BEFORE UPDATE ON risiko_bahaya
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_risiko ON risiko_bahaya;
CREATE TRIGGER trg_touch_parent_risiko
AFTER INSERT OR UPDATE OR DELETE ON risiko_bahaya
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

CREATE TABLE IF NOT EXISTS syarat_jabatan (
  id                       SERIAL PRIMARY KEY,
  jabatan_id               uuid REFERENCES jabatan(id) ON DELETE CASCADE,
  keterampilan_kerja       text[],
  bakat_kerja              text[],
  temperamen_kerja         text[],
  minat_kerja              text[],
  upaya_fisik              text[],
  kondisi_fisik_jenkel     text,
  kondisi_fisik_umur       text,
  kondisi_fisik_tb         text,
  kondisi_fisik_bb         text,
  kondisi_fisik_pb         text,
  kondisi_fisik_tampilan   text,
  kondisi_fisik_keadaan    text,
  fungsi_pekerja           text[],
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS syarat_jabatan_touch ON syarat_jabatan;
CREATE TRIGGER syarat_jabatan_touch
BEFORE UPDATE ON syarat_jabatan
FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_syarat ON syarat_jabatan;
CREATE TRIGGER trg_touch_parent_syarat
AFTER INSERT OR UPDATE OR DELETE ON syarat_jabatan
FOR EACH ROW EXECUTE FUNCTION touch_parent_jabatan();

/* ============================================================================
   INDEX tambahan
   ============================================================================ */
CREATE INDEX IF NOT EXISTS idx_jabatan_id           ON jabatan (id);
CREATE INDEX IF NOT EXISTS idx_jabatan_slug         ON jabatan (slug);
CREATE INDEX IF NOT EXISTS idx_jabatan_struktur_id  ON jabatan (struktur_id);
CREATE INDEX IF NOT EXISTS idx_jabatan_updated_at   ON jabatan (updated_at);

CREATE INDEX IF NOT EXISTS idx_unit_kerja_jabatan       ON unit_kerja (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_kualifikasi_jabatan_jabatan ON kualifikasi_jabatan (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_hasil_kerja_jabatan      ON hasil_kerja (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_bahan_kerja_jabatan      ON bahan_kerja (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_perangkat_kerja_jabatan  ON perangkat_kerja (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_tanggung_jawab_jabatan   ON tanggung_jawab (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_wewenang_jabatan         ON wewenang (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_korelasi_jabatan_jabatan ON korelasi_jabatan (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_kondisi_lingkungan_kerja_jabatan ON kondisi_lingkungan_kerja (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_risiko_bahaya_jabatan    ON risiko_bahaya (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_syarat_jabatan_jabatan   ON syarat_jabatan (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_tugas_pokok_jabatan      ON tugas_pokok (jabatan_id);
CREATE INDEX IF NOT EXISTS idx_tahapan_tugas            ON tahapan_uraian_tugas (tugas_id);

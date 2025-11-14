# Migration: Enable pg_trgm untuk Fuzzy Matching

Fitur auto-match anjab memerlukan ekstensi PostgreSQL `pg_trgm` untuk fuzzy text matching.

## Cara Menjalankan Migration

### Opsi 1: Via Docker (jika container running)
```powershell
Get-Content migrations\005_enable_pg_trgm.sql | docker exec -i uianjab-db-1 psql -U anjab_user -d anjab_db
```

### Opsi 2: Via psql langsung
```bash
psql -U anjab_user -d anjab_db -f migrations/005_enable_pg_trgm.sql
```

### Opsi 3: Copy-paste manual ke psql
Buka psql console dan jalankan:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_jabatan_nama_jabatan_trgm 
ON jabatan USING gin (nama_jabatan gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_peta_jabatan_nama_jabatan_trgm 
ON peta_jabatan USING gin (nama_jabatan gin_trgm_ops);
```

## Verifikasi

Cek apakah ekstensi sudah aktif:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
```

Cek apakah index sudah dibuat:
```sql
\di idx_jabatan_nama_jabatan_trgm
\di idx_peta_jabatan_nama_jabatan_trgm
```

## Cara Kerja Fitur

1. Saat user menambah jabatan baru di peta jabatan
2. Sistem otomatis mencari anjab master dengan nama mirip
3. Menggunakan PostgreSQL SIMILARITY function (trigram matching)
4. Jika similarity > 0.5 (50%), otomatis set jabatan_id
5. UI menampilkan:
   - ✓ Hijau: Anjab cocok (similarity > 80%)
   - ℹ️ Biru: Anjab mirip (similarity 50-80%)
   - ⚠️ Kuning: Tidak ada match, tampilkan suggestions

## API Endpoint Baru

- `GET /api/anjab/match?nama_jabatan=xxx` - Mencari anjab yang cocok
- Response:
  ```json
  {
    "success": true,
    "match": {
      "jabatan_id": "uuid",
      "nama_jabatan": "Nama Anjab",
      "similarity": 0.85,
      "confidence": "high"
    },
    "alternatives": [...]
  }
  ```

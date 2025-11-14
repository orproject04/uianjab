# Auto-Match Anjab Feature

Fitur otomatis mencocokkan nama jabatan baru dengan dokumen master anjab yang sudah ada menggunakan fuzzy text matching.

## Cara Kerja

### 1. Backend Auto-Matching (POST /api/peta-jabatan)
Saat user menambah jabatan baru:
```typescript
// Auto-match berdasarkan similarity
const matchResult = await pool.query(
    `SELECT id, SIMILARITY(nama_jabatan, $1) as similarity
     FROM jabatan
     WHERE SIMILARITY(nama_jabatan, $1) > 0.5
     ORDER BY similarity DESC
     LIMIT 1`,
    [nama_jabatan]
);

// Jika similarity > 50%, otomatis set jabatan_id
if (matchResult.rows.length > 0) {
    matched_jabatan_id = matchResult.rows[0].id;
}
```

### 2. Frontend Real-time Preview (AppSidebar.tsx)
Saat user mengetik nama jabatan di modal "Tambah Jabatan":
- Debounce 500ms
- Call API `/api/anjab/match?nama_jabatan=xxx`
- Tampilkan indicator:
  - **✓ Hijau** (similarity > 80%): "Anjab cocok ditemukan!"
  - **ℹ️ Biru** (similarity 50-80%): "Anjab mirip ditemukan"
  - **⚠️ Kuning** (similarity < 50%): "Tidak ada anjab yang cocok" + suggestions

### 3. Success Notification
Setelah jabatan berhasil ditambah:
- Jika ada match: Tampilkan nama anjab yang terdeteksi
- Jika tidak ada: Warning untuk tambah anjab manual

## Setup Requirements

### 1. Enable PostgreSQL pg_trgm Extension
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 2. Create GIN Index (Optional, untuk performa)
```sql
CREATE INDEX idx_jabatan_nama_jabatan_trgm 
ON jabatan USING gin (nama_jabatan gin_trgm_ops);
```

### 3. Run Migration
```powershell
Get-Content migrations\005_enable_pg_trgm.sql | docker exec -i uianjab-db-1 psql -U anjab_user -d anjab_db
```

## API Endpoints

### GET /api/anjab/match
Mencari anjab yang cocok dengan nama jabatan.

**Query Parameters:**
- `nama_jabatan` (required): Nama jabatan yang akan dicocokkan

**Response:**
```json
{
  "success": true,
  "match": {
    "jabatan_id": "uuid",
    "nama_jabatan": "Kepala Biro Umum",
    "similarity": 0.85,
    "confidence": "high"
  },
  "alternatives": [
    {
      "id": "uuid",
      "nama_jabatan": "Kepala Sub Bagian Umum",
      "similarity": 0.65
    }
  ]
}
```

**Confidence Levels:**
- `high`: similarity > 0.8 (80%)
- `medium`: similarity 0.5 - 0.8 (50-80%)

### POST /api/peta-jabatan (Enhanced)
Response sekarang include info anjab yang ter-match:

```json
{
  "ok": true,
  "node": {...},
  "path": "setjen/biro-umum",
  "matched_anjab": {
    "jabatan_id": "uuid",
    "nama_anjab": "Kepala Biro Umum"
  }
}
```

## UI Components

### Add Jabatan Modal
File: `src/layout/AppSidebar.tsx`

**States:**
- `matchedAnjab`: Anjab yang cocok (jika ada)
- `matchingSuggestions`: Daftar anjab mirip (jika tidak ada match)
- `checkingMatch`: Loading state saat check matching

**Visual Indicators:**
```tsx
// Loading
<div className="text-xs text-gray-500 bg-gray-50">
  <spinner /> Mencari anjab yang cocok...
</div>

// High confidence match
<div className="bg-green-50 border-green-200 text-green-700">
  ✓ Anjab cocok ditemukan!
  Kepala Biro Umum
  Kemiripan: 85%
</div>

// Medium confidence
<div className="bg-blue-50 border-blue-200 text-blue-700">
  Anjab mirip ditemukan
  Kepala Sub Bagian Umum
  Kemiripan: 65%
</div>

// No match
<div className="bg-yellow-50 border-yellow-200 text-yellow-700">
  ⚠️ Tidak ada anjab yang cocok
  Saran: ...
</div>
```

## Similarity Algorithm

PostgreSQL `pg_trgm` menggunakan **trigram similarity**:

1. Split text menjadi trigrams (3-character sequences)
2. Hitung Jaccard similarity: `|A ∩ B| / |A ∪ B|`
3. Return score 0-1 (1 = exact match)

**Contoh:**
- "Kepala Biro" vs "Kepala Biro Umum" → 0.75
- "Kepala Biro" vs "Kabiro" → 0.45
- "Kepala Biro" vs "Staf Admin" → 0.15

**Threshold:**
- Match: similarity > 0.5 (50%)
- High confidence: similarity > 0.8 (80%)

## Benefits

1. **Auto-fill jabatan_id**: Hemat waktu, tidak perlu cari manual
2. **Real-time preview**: User tahu sebelum submit apakah ada anjab cocok
3. **Smart suggestions**: Jika tidak match, tampilkan alternatif terdekat
4. **Reduce errors**: Similarity matching toleran terhadap typo minor

## Future Enhancements

- [ ] Manual override: Pilih dari suggestions jika auto-match salah
- [ ] Learn from user corrections: Machine learning untuk improve matching
- [ ] Batch matching: Match multiple jabatan sekaligus
- [ ] Alias support: "Kabiro" = "Kepala Biro"

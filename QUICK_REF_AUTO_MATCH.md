# Quick Reference: Auto-Match Anjab

## 🔍 Debug Commands

### Check pg_trgm Extension
```sql
-- Verify extension exists
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';

-- Should return: extname='pg_trgm', extversion='1.6'
```

### Check Indexes
```sql
-- List all trigram indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE indexname LIKE '%_trgm';

-- Should return:
-- idx_jabatan_nama_jabatan_trgm | jabatan
-- idx_peta_jabatan_nama_jabatan_trgm | peta_jabatan
```

### Test Similarity Query
```sql
-- Test similarity matching manually
SELECT 
    id,
    nama_jabatan,
    SIMILARITY(nama_jabatan, 'Kepala Biro Umum') as sim
FROM jabatan
WHERE SIMILARITY(nama_jabatan, 'Kepala Biro Umum') > 0.2
ORDER BY sim DESC
LIMIT 5;
```

### Check Recent Matches
```sql
-- See jabatan with jabatan_id
SELECT 
    pj.nama_jabatan as nama_peta,
    j.nama_jabatan as nama_anjab,
    pj.created_at
FROM peta_jabatan pj
JOIN jabatan j ON pj.jabatan_id = j.id
ORDER BY pj.created_at DESC
LIMIT 10;
```

## 🌐 API Endpoints

### Test Match API
```bash
# High similarity
curl "http://localhost:3000/api/anjab/match?nama_jabatan=Kepala%20Biro%20Umum"

# Medium similarity
curl "http://localhost:3000/api/anjab/match?nama_jabatan=Kabiro%20Umum"

# No match
curl "http://localhost:3000/api/anjab/match?nama_jabatan=XYZ%20Test%20123"
```

### Expected Response
```json
{
  "success": true,
  "match": {
    "jabatan_id": "uuid-here",
    "nama_jabatan": "Kepala Biro Umum",
    "similarity": 0.85,
    "confidence": "high"
  },
  "alternatives": [...]
}
```

## 🔧 Common Fixes

### Re-enable Extension
```sql
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
CREATE EXTENSION pg_trgm;
```

### Re-create Indexes
```sql
DROP INDEX IF EXISTS idx_jabatan_nama_jabatan_trgm;
DROP INDEX IF EXISTS idx_peta_jabatan_nama_jabatan_trgm;

CREATE INDEX idx_jabatan_nama_jabatan_trgm 
ON jabatan USING gin (nama_jabatan gin_trgm_ops);

CREATE INDEX idx_peta_jabatan_nama_jabatan_trgm 
ON peta_jabatan USING gin (nama_jabatan gin_trgm_ops);
```

### Manual Set jabatan_id
```sql
-- If auto-match fails, set manually
UPDATE peta_jabatan 
SET jabatan_id = 'uuid-of-jabatan'
WHERE id = 'uuid-of-peta-jabatan';
```

## 📝 Files to Check

### Backend
- `src/app/api/anjab/match/route.ts` - Match endpoint
- `src/app/api/peta-jabatan/route.ts` - Auto-match logic (line ~230)

### Frontend
- `src/layout/AppSidebar.tsx` - UI matching preview (line ~60-120)

### Database
- `migrations/005_enable_pg_trgm.sql` - Extension & indexes

## 🎨 UI States

| State | Color | Message | Action |
|-------|-------|---------|--------|
| Loading | Gray | "Mencari anjab yang cocok..." | Spinner animating |
| High Match | Green | "✓ Anjab cocok ditemukan!" | similarity > 0.8 |
| Medium Match | Blue | "Anjab mirip ditemukan" | similarity 0.5-0.8 |
| No Match | Yellow | "⚠️ Tidak ada anjab yang cocok" | similarity < 0.5 |
| Error | Red | "Error: ..." | API/network error |

## ⚙️ Configuration

### Thresholds (Backend)
```typescript
// src/app/api/anjab/match/route.ts
WHERE SIMILARITY(nama_jabatan, $1) > 0.2  // Min untuk suggestions
...
if (rows[0].similarity > 0.5) {  // Auto-match threshold

// Confidence levels
similarity > 0.8 → "high"
similarity 0.5-0.8 → "medium"
```

### Debounce (Frontend)
```typescript
// src/layout/AppSidebar.tsx
setTimeout(() => {
    checkAnjabMatch(addName);
}, 500);  // 500ms debounce
```

## 📊 Performance

- **Query time:** ~5-20ms (with GIN index)
- **Without index:** ~100-500ms (not recommended)
- **Debounce delay:** 500ms
- **API response:** ~50-100ms total

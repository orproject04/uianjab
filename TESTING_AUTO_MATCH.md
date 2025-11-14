# 🧪 Testing Guide: Auto-Match Anjab Feature

## ✅ Prerequisites Completed

- [x] pg_trgm extension enabled (v1.6)
- [x] GIN indexes created on jabatan & peta_jabatan tables
- [x] API endpoint `/api/anjab/match` ready
- [x] Enhanced POST `/api/peta-jabatan` with auto-matching
- [x] UI enhancements in AppSidebar.tsx
- [x] Development server running at http://localhost:3000

## 📝 Testing Steps

### 1. Login sebagai Admin

1. Buka http://localhost:3000
2. Login dengan akun admin
3. Pastikan Anda memiliki role "admin" untuk akses fitur edit peta jabatan

### 2. Test Auto-Match: Scenario 1 - High Similarity Match

**Tujuan:** Test matching dengan nama jabatan yang sangat mirip (similarity > 80%)

**Steps:**
1. Buka sidebar → Expand "Anjab" menu
2. Pilih jabatan parent (misal: "Setjen DPD RI" atau unit kerja manapun)
3. Klik icon **⋯** (3 dots) → Pilih **"Tambah Jabatan"**
4. Di modal "Tambah Jabatan", ketik nama yang mirip dengan anjab master existing:
   - Contoh: "Kepala Biro Umum"
   - Contoh: "Kepala Bagian Keuangan"
   - Contoh: "Staf Administrasi"

**Expected Result:**
- Setelah 500ms (debounce), muncul box **HIJAU** dengan ikon ✓
- Text: "✓ Anjab cocok ditemukan!"
- Menampilkan nama anjab yang match
- Kemiripan: >80%

**Screenshot Location:** `docs/screenshots/test-high-match.png`

### 3. Test Auto-Match: Scenario 2 - Medium Similarity Match

**Tujuan:** Test matching dengan kemiripan sedang (similarity 50-80%)

**Steps:**
1. Klik "Tambah Jabatan" lagi
2. Ketik nama yang agak berbeda tapi masih mirip:
   - Contoh: "Kabiro Umum" (jika master = "Kepala Biro Umum")
   - Contoh: "Staf Admin" (jika master = "Staf Administrasi")

**Expected Result:**
- Muncul box **BIRU** dengan ikon ℹ️
- Text: "Anjab mirip ditemukan"
- Menampilkan nama anjab yang match
- Kemiripan: 50-80%

### 4. Test Auto-Match: Scenario 3 - No Match

**Tujuan:** Test ketika tidak ada anjab yang cocok (similarity < 50%)

**Steps:**
1. Klik "Tambah Jabatan" lagi
2. Ketik nama jabatan yang sangat berbeda:
   - Contoh: "Jabatan Baru Test 123"
   - Contoh: "XYZ Administrator"

**Expected Result:**
- Muncul box **KUNING** dengan ikon ⚠️
- Text: "⚠️ Tidak ada anjab yang cocok"
- Menampilkan "Saran anjab mirip:" dengan list 1-3 anjab terdekat

### 5. Test Auto-Match: Scenario 4 - Submit & Verify

**Tujuan:** Verify bahwa jabatan_id benar-benar tersimpan

**Steps:**
1. Gunakan nama yang match (dari Scenario 1)
2. Isi field lainnya:
   - Kode Penamaan: auto-generated atau custom
   - Unit Kerja: optional
   - Pusat/Daerah: pilih salah satu
   - Jenis Jabatan: pilih dari dropdown
3. Klik **"Simpan"**

**Expected Result:**
- Modal tertutup
- Muncul **SweetAlert** dengan:
  - Icon: Success (✓)
  - Title: "Jabatan berhasil ditambah"
  - Body: Box hijau dengan text "✓ Anjab terdeteksi: [Nama Anjab]"
  - Auto-close setelah 3 detik
- Jabatan baru muncul di sidebar

### 6. Verify di Database

**Steps:**
1. Buka psql atau pgAdmin
2. Run query:
   ```sql
   SELECT 
       pj.id,
       pj.nama_jabatan,
       pj.jabatan_id,
       j.nama_jabatan as nama_anjab,
       pj.created_at
   FROM peta_jabatan pj
   LEFT JOIN jabatan j ON pj.jabatan_id = j.id
   WHERE pj.jabatan_id IS NOT NULL
   ORDER BY pj.created_at DESC
   LIMIT 5;
   ```

**Expected Result:**
- Jabatan baru muncul dengan `jabatan_id` NOT NULL
- `nama_anjab` sesuai dengan yang ditampilkan di UI

### 7. Test Real-time Preview (Debounce)

**Tujuan:** Verify bahwa matching tidak langsung call API setiap keystroke

**Steps:**
1. Buka "Tambah Jabatan"
2. Ketik nama pelan-pelan, satu huruf per detik
3. Observe browser Network tab (F12 → Network)

**Expected Result:**
- API `/api/anjab/match` TIDAK dipanggil setiap keystroke
- API dipanggil HANYA setelah user berhenti mengetik 500ms
- Loading spinner muncul saat checking

### 8. Test Edge Cases

#### 8a. Empty Input
- **Input:** Kosongkan nama jabatan
- **Expected:** Indicator hilang, tidak ada API call

#### 8b. Very Short Input (< 3 chars)
- **Input:** "AB"
- **Expected:** Tidak ada matching, tidak ada API call

#### 8c. Special Characters
- **Input:** "Kepala @ Biro # Umum"
- **Expected:** Matching tetap berjalan, special chars diabaikan

#### 8d. Case Insensitive
- **Input:** "KEPALA BIRO UMUM" vs "kepala biro umum"
- **Expected:** Matching sama, similarity tidak terpengaruh case

## 🐛 Known Issues & Troubleshooting

### Issue 1: API Error 500
**Symptom:** Red error box di modal
**Solution:** 
- Check browser console untuk detail error
- Verify pg_trgm extension: `SELECT * FROM pg_extension WHERE extname = 'pg_trgm';`

### Issue 2: No Matching Indicator
**Symptom:** Tidak muncul box hijau/biru/kuning
**Solution:**
- Check browser console untuk error
- Verify API endpoint works: `GET /api/anjab/match?nama_jabatan=test`
- Check `checkingMatch` state di React DevTools

### Issue 3: jabatan_id Still NULL After Submit
**Symptom:** Database menunjukkan jabatan_id = NULL
**Solution:**
- Check server logs untuk similarity score
- Verify threshold (> 0.5) di backend
- Manual set jabatan_id via Edit Jabatan

## 📊 Success Metrics

After testing, verify:
- [ ] High similarity match works (green indicator)
- [ ] Medium similarity match works (blue indicator)
- [ ] No match shows suggestions (yellow indicator)
- [ ] Debounce prevents excessive API calls
- [ ] jabatan_id saved correctly in database
- [ ] Success notification shows matched anjab name
- [ ] No console errors

## 🎯 Next Steps After Testing

If all tests pass:
1. ✅ Feature is production-ready
2. Consider adding manual override option
3. Consider showing confidence % to user
4. Consider batch matching for existing jabatan

If tests fail:
1. Document the issue
2. Check browser console & server logs
3. Verify database migration ran successfully
4. Re-run migration if needed

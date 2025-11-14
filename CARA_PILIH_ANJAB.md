# 📖 Cara Memilih Anjab dari Suggestions

## 🎯 Langkah-langkah:

### 1. **Buka Modal "Tambah Jabatan"**
   - Klik icon **⋯** (3 titik) di samping jabatan parent
   - Pilih **"Tambah Jabatan"**

### 2. **Ketik Nama Jabatan**
   - Masukkan nama jabatan di field "Nama"
   - Tunggu 500ms (debounce)
   - Sistem akan otomatis mencari anjab yang cocok

### 3. **Lihat Hasil Matching**

#### **Jika Muncul Box HIJAU/BIRU (Ada Match):**
```
✓ Anjab cocok ditemukan!
Kepala Biro Umum
Kemiripan: 85%

[Pilih anjab lain dari saran] ← Klik ini jika mau pilih manual
```

- **HIJAU** = Similarity > 80% (high confidence)
- **BIRU** = Similarity 50-80% (medium confidence)
- Klik tombol "Pilih anjab lain dari saran" untuk lihat opsi lain

#### **Jika Muncul Box KUNING (No Match):**
```
⚠️ Tidak ada anjab yang cocok
Pilih salah satu anjab yang mirip di bawah ini:

┌─────────────────────────────────────────┐
│ Pengelola Layanan Kesehatan             │ ← BUTTON (bisa diklik!)
│ Kemiripan: 34%                          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Penata Kelola Sistem dan Teknologi...  │ ← BUTTON (bisa diklik!)
│ Kemiripan: 30%                          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Penata Kelola Sistem dan Teknologi...  │ ← BUTTON (bisa diklik!)
│ Kemiripan: 30%                          │
└─────────────────────────────────────────┘
```

### 4. **Pilih Anjab dengan Klik Button**

**SEBELUM DIKLIK:**
- Button berwarna **putih** dengan border abu-abu
- Hover → Border berubah ungu + background ungu muda

**SETELAH DIKLIK:**
- Button berubah **ungu tua** dengan teks putih
- Muncul icon **✓** (checkmark) di kanan
- Muncul text "✓ Anjab dipilih: [Nama]" di bawah
- Tombol **"Batal"** muncul untuk cancel

### 5. **Batal Pilihan (Opsional)**
Jika ingin ganti pilihan:
- Klik tombol **"Batal"** di bawah suggestions
- Atau klik anjab yang lain (otomatis ganti)

### 6. **Submit Form**
- Isi field lainnya (Kode Penamaan, Unit Kerja, dll)
- Klik **"Simpan"**
- Success notification akan muncul dengan info anjab yang dipilih

---

## 🎨 Visual Guide:

### **No Match - Before Selection:**
```
┌────────────────────────────────────────────────┐
│ ⚠️ Tidak ada anjab yang cocok                  │
│ Pilih salah satu anjab yang mirip di bawah ini:│
│                                                │
│ ┌────────────────────────────────────────┐    │
│ │ 🔲 Pengelola Layanan Kesehatan         │ ←  │
│ │    Kemiripan: 34%                      │    │
│ └────────────────────────────────────────┘    │
│                                                │
│ ┌────────────────────────────────────────┐    │
│ │ 🔲 Penata Kelola Sistem...            │    │
│ │    Kemiripan: 30%                      │    │
│ └────────────────────────────────────────┘    │
└────────────────────────────────────────────────┘
```

### **After Selection (Button Diklik):**
```
┌────────────────────────────────────────────────┐
│ ⚠️ Tidak ada anjab yang cocok                  │
│ Pilih salah satu anjab yang mirip di bawah ini:│
│                                                │
│ ┌────────────────────────────────────────┐    │
│ │ ✅ Pengelola Layanan Kesehatan    ✓   │ ← SELECTED!
│ │    Kemiripan: 34%                      │    │
│ └────────────────────────────────────────┘    │
│   (Background UNGU, Text PUTIH)                │
│                                                │
│ ┌────────────────────────────────────────┐    │
│ │ 🔲 Penata Kelola Sistem...            │    │
│ │    Kemiripan: 30%                      │    │
│ └────────────────────────────────────────┘    │
│                                                │
│ ─────────────────────────────────────────────  │
│ ✓ Anjab dipilih: Pengelola Layanan...  [Batal]│
└────────────────────────────────────────────────┘
```

---

## 🔍 Troubleshooting:

### **Problem: Suggestions tidak muncul sebagai button**
**Solution:**
1. Hard refresh browser: `Ctrl + Shift + R` (Windows) atau `Cmd + Shift + R` (Mac)
2. Clear browser cache
3. Restart dev server:
   ```powershell
   # Stop server (Ctrl+C)
   # Restart
   powershell -ExecutionPolicy Bypass -Command "npm run dev"
   ```

### **Problem: Button tidak bisa diklik**
**Solution:**
1. Buka Browser Console (F12)
2. Check apakah ada error JavaScript
3. Coba klik button lagi - seharusnya muncul console.log "Selected anjab: ..."

### **Problem: Setelah diklik button tidak berubah warna**
**Solution:**
1. Check apakah `selectedAnjabId` state ter-update (React DevTools)
2. Verify className conditional logic
3. Hard refresh browser

---

## ✅ Checklist Testing:

- [ ] Box kuning muncul saat no match
- [ ] Suggestions tampil sebagai button (bukan list text)
- [ ] Button putih dengan border abu-abu (default)
- [ ] Hover → border ungu + background ungu muda
- [ ] Click → button ungu tua + teks putih + icon ✓
- [ ] Text "✓ Anjab dipilih: ..." muncul di bawah
- [ ] Tombol "Batal" muncul dan berfungsi
- [ ] Submit → Success notification menampilkan anjab yang dipilih
- [ ] Database: `jabatan_id` tersimpan dengan benar

---

## 💡 Tips:

1. **Jangan terburu-buru**: Tunggu sampai suggestions muncul sebelum klik
2. **Lihat similarity %**: Pilih yang paling tinggi untuk akurasi terbaik
3. **Bisa ganti pilihan**: Klik anjab lain untuk ganti selection
4. **Auto-match vs Manual**: 
   - Auto-match (>50%) = sistem pilih otomatis
   - Manual selection = Anda yang tentukan


import os
import re
import json
from win32com.client import Dispatch
from docx import Document

def clean(text):
    return re.sub(r'[\u0007\r\t\x0b\x0c]', '', text).strip()

def read_docx(file_path):
    doc = Document(file_path)
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return doc, lines

def read_doc(file_path):
    word = Dispatch("Word.Application")
    word.Visible = False
    doc = word.Documents.Open(os.path.abspath(file_path))
    text = doc.Content.Text
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return doc, lines

def extract_line_value(label, lines):
    for line in lines:
        if label in line:
            parts = line.split(":")
            if len(parts) >= 2:
                return parts[1].strip()
    return "---"

def extract_unit_kerja(lines):
    unit_kerja = {
        "JPT Utama": "---", "JPT Madya": "---", "JPT Pratama": "---",
        "Administrator": "---", "Pengawas": "---", "Pelaksana": "---",
        "Jabatan Fungsional": "---"
    }
    start = False
    for line in lines:
        if "UNIT KERJA" in line.upper():
            start = True
            continue
        if start:
            if "IKHTISAR JABATAN" in line.upper() or "KUALIFIKASI JABATAN" in line.upper():
                break
            for key in unit_kerja:
                if key.upper() in line.upper():
                    value = line.split(":")[-1].strip()
                    unit_kerja[key] = value
    return unit_kerja

def extract_block(start_marker, end_marker, lines):
    start_idx = end_idx = None
    for i, line in enumerate(lines):
        if start_marker in line:
            start_idx = i + 1
        elif end_marker in line and start_idx is not None:
            end_idx = i
            break
    if start_idx is not None and end_idx is not None:
        return "\n".join(lines[start_idx:end_idx]).strip()
    return "---"

def extract_kualifikasi(lines):
    result = {
        "pendidikan_formal": [],
        "pendidikan_dan_pelatihan": {
            "diklat_penjenjangan": [],
            "diklat_teknis": [],
            "diklat_fungsional": []
        },
        "pengalaman_kerja": []
    }

    start_idx = None
    for i, line in enumerate(lines):
        if "KUALIFIKASI JABATAN" in line.upper():
            start_idx = i
            break
    if start_idx is None:
        return result

    sublines = lines[start_idx:]
    current = None

    for line in sublines:
        if "TUGAS POKOK" in line.upper():
            break

        clean_line = re.sub(r'[\u0007\t\u0000-\u001F]', '', line).strip()
        if not clean_line or clean_line == ":":
            continue

        if "Pendidikan Formal" in clean_line:
            current = "pendidikan_formal"
            continue
        elif "Pendidikan dan Pelatihan" in clean_line:
            current = None
            continue
        elif "Diklat Penjenjangan" in clean_line:
            current = "diklat_penjenjangan"
            continue
        elif "Diklat Teknis" in clean_line:
            current = "diklat_teknis"
            continue
        elif "Diklat Fungsional" in clean_line:
            current = "diklat_fungsional"
            continue
        elif "Pengalaman Kerja" in clean_line:
            current = "pengalaman_kerja"
            continue

        if current == "pendidikan_formal":
            result["pendidikan_formal"].append(clean_line)
        elif current in ["diklat_penjenjangan", "diklat_teknis", "diklat_fungsional"]:
            result["pendidikan_dan_pelatihan"][current].append(clean_line)
        elif current == "pengalaman_kerja":
            no_number = re.sub(r'^\s*\d+[\.\)]\s*', '', clean_line)
            result["pengalaman_kerja"].append(no_number)

    return result

def extract_tugas_pokok(doc):
    tugas_list = []
    for table in doc.Tables:
        headers = [cell.Range.Text.strip().lower().replace('\r\x07', '') for cell in table.Rows.Item(1).Cells]
        if not ("uraian tugas" in headers and "hasil kerja" in headers):
            continue

        uraian_idx = headers.index("uraian tugas")
        hasil_idx = headers.index("hasil kerja")

        for i in range(2, table.Rows.Count + 1):
            row = table.Rows.Item(i)
            cells = row.Cells

            if cells.Count < max(uraian_idx + 1, hasil_idx + 1):
                continue

            no = str(len(tugas_list) + 1)
            uraian_cell = cells.Item(uraian_idx + 1)
            hasil_cell = cells.Item(hasil_idx + 1)

            deskripsi, tahapan = extract_deskripsi_dan_tahapan(uraian_cell)
            hasil_raw = extract_bullet_marked_text(hasil_cell)
            hasil_items = split_items(hasil_raw)

            # Deteksi baris invalid dari deskripsi atau hasil kerja
            if deskripsi.strip(". -").strip().lower() in ["", "...........", "..........", "-", "–"]:
                continue
            if hasil_raw.strip(". -").strip().lower() in ["", "...........", "..........", "-", "–"]:
                continue

            # Deteksi baris yang mengandung "jumlah pegawai" baik di kolom no atau uraian
            no_text = no.strip().lower()
            uraian_text = deskripsi.strip().lower()
            if "jumlah" in no_text or "jumlah pegawai" in no_text or "jumlah" in uraian_text or "jumlah pegawai" in uraian_text:
                continue

            tugas_list.append({
                "no": no,
                "uraian_tugas": {
                    "deskripsi": deskripsi,
                    "tahapan": tahapan
                },
                "hasil_kerja": hasil_items,
                "jumlah_hasil": "",
                "waktu_penyelesaian_(jam)": "",
                "waktu_efektif": "",
                "kebutuhan_pegawai": ""
            })

    return tugas_list

def extract_hasil_kerja(doc):
    hasil_list = []
    for table in doc.Tables:
        headers = [cell.Range.Text.strip().lower().replace('\r\x07', '') for cell in table.Rows.Item(1).Cells]
        if not ("hasil kerja" in headers and "satuan hasil" in headers):
            continue

        hasil_idx = headers.index("hasil kerja")
        satuan_idx = headers.index("satuan hasil")

        for i in range(2, table.Rows.Count + 1):
            row = table.Rows.Item(i)
            cells = row.Cells

            if cells.Count < max(hasil_idx + 1, satuan_idx + 1):
                continue

            no = str(len(hasil_list) + 1)
            hasil_cell = cells.Item(hasil_idx + 1)
            satuan_cell = cells.Item(satuan_idx + 1)

            hasil_raw = extract_bullet_marked_text(hasil_cell)
            satuan_raw = extract_bullet_marked_text(satuan_cell)

            hasil_items = split_items(hasil_raw)
            satuan_items = split_items(satuan_raw)

            # Pastikan array, meskipun kosong
            if not hasil_items:
                hasil_items = []
            if not satuan_items:
                satuan_items = []

            hasil_list.append({
                "no": no,
                "hasil_kerja": hasil_items,
                "satuan_hasil": satuan_items
            })

    return hasil_list

def extract_bahan_kerja(doc):
    bahan_list = []
    for table in doc.Tables:
        headers = [cell.Range.Text.strip().lower().replace('\r\x07', '') for cell in table.Rows.Item(1).Cells]
        if not ("bahan kerja" in headers and "penggunaan dalam tugas" in headers):
            continue

        bahan_idx = headers.index("bahan kerja")
        penggunaan_idx = headers.index("penggunaan dalam tugas")

        for i in range(2, table.Rows.Count + 1):
            row = table.Rows.Item(i)
            cells = row.Cells

            if cells.Count < max(bahan_idx + 1, penggunaan_idx + 1):
                continue

            no = str(len(bahan_list) + 1)
            bahan_cell = cells.Item(bahan_idx + 1)
            penggunaan_cell = cells.Item(penggunaan_idx + 1)

            bahan_raw = extract_bullet_marked_text(bahan_cell)
            penggunaan_raw = extract_bullet_marked_text(penggunaan_cell)

            bahan_items = split_items(bahan_raw)
            penggunaan_items = split_items(penggunaan_raw)

            if not bahan_items:
                bahan_items = []
            if not penggunaan_items:
                penggunaan_items = []

            bahan_list.append({
                "no": no,
                "bahan_kerja": bahan_items,
                "penggunaan_dalam_tugas": penggunaan_items
            })

    return bahan_list

def extract_perangkat_kerja(doc):
    perangkat_list = []

    try:
        for table in doc.Tables:
            headers = [clean(cell.Range.Text).lower().strip() for cell in table.Rows.Item(1).Cells]

            if "perangkat kerja" in headers and "penggunaan" in " ".join(headers):
                perangkat_idx = headers.index("perangkat kerja")
                penggunaan_idx = next((i for i, h in enumerate(headers) if "penggunaan" in h), None)

                for i in range(2, table.Rows.Count + 1):
                    row = table.Rows.Item(i)
                    cells = row.Cells

                    perangkat_cell = cells.Item(perangkat_idx + 1)
                    penggunaan_cell = cells.Item(penggunaan_idx + 1) if penggunaan_idx is not None else None

                    perangkat_raw = extract_bullet_marked_text(perangkat_cell)
                    penggunaan_raw = extract_bullet_marked_text(penggunaan_cell) if penggunaan_cell else ""

                    perangkat_items = split_items(perangkat_raw)
                    penggunaan_items = split_items(penggunaan_raw)

                    perangkat_list.append({
                        "no": str(len(perangkat_list) + 1),
                        "perangkat_kerja": perangkat_items,
                        "penggunaan_untuk_tugas": penggunaan_items
                    })
                break
    except Exception as e:
        print(f"❌ Gagal ekstrak perangkat kerja: {e}")

    return perangkat_list

def extract_tanggung_jawab(doc):
    tanggung_list = []
    found_heading = False

    for para in doc.Paragraphs:
        text = clean(para.Range.Text).lower()
        if "tanggung jawab" in text:
            found_heading = True
        elif found_heading and para.Range.Tables.Count > 0:
            table = para.Range.Tables(1)
            headers = [clean(cell.Range.Text).lower().strip() for cell in table.Rows.Item(1).Cells]

            if "no." in headers and "uraian" in headers:
                uraian_idx = headers.index("uraian")

                for i in range(2, table.Rows.Count + 1):
                    row = table.Rows.Item(i)
                    cells = row.Cells

                    uraian_cell = cells.Item(uraian_idx + 1)
                    uraian_raw = extract_bullet_marked_text(uraian_cell)
                    # uraian_items = split_items(uraian_raw)
                    uraian_cleaned = " ".join([item.strip() for item in uraian_raw.split("|||") if item.strip()])

                    tanggung_list.append({
                        "no": str(len(tanggung_list) + 1),
                        "uraian": uraian_cleaned
                    })
                break

    return tanggung_list

def extract_wewenang(doc):
    wewenang_list = []
    found_heading = False

    for para in doc.Paragraphs:
        text = clean(para.Range.Text).lower()
        if "wewenang" in text:
            found_heading = True
        elif found_heading and para.Range.Tables.Count > 0:
            table = para.Range.Tables(1)
            headers = [clean(cell.Range.Text).lower().strip() for cell in table.Rows.Item(1).Cells]

            if "no." in headers and "uraian" in headers:
                uraian_idx = headers.index("uraian")

                for i in range(2, table.Rows.Count + 1):
                    row = table.Rows.Item(i)
                    cells = row.Cells

                    uraian_cell = cells.Item(uraian_idx + 1)
                    uraian_raw = extract_bullet_marked_text(uraian_cell)
                    # uraian_items = split_items(uraian_raw)
                    uraian_cleaned = " ".join([item.strip() for item in uraian_raw.split("|||") if item.strip()])

                    wewenang_list.append({
                        "no": str(len(wewenang_list) + 1),
                        "uraian": uraian_cleaned
                    })
                break

    return wewenang_list

def extract_korelasi_jabatan(doc):
    korelasi_list = []

    try:
        for table in doc.Tables:
            headers = [clean(cell.Range.Text).lower().strip() for cell in table.Rows.Item(1).Cells]

            if (
                "jabatan" in headers and
                any(h in headers for h in ["unit kerja/instansi", "unit kerja", "instansi"]) and
                any("dalam hal" in h for h in headers)
            ):
                jabatan_idx = headers.index("jabatan")
                unit_idx = next((i for i, h in enumerate(headers) if "unit kerja" in h or "instansi" in h), None)
                hal_idx = next((i for i, h in enumerate(headers) if "dalam hal" in h), None)

                for i in range(2, table.Rows.Count + 1):
                    row = table.Rows.Item(i)
                    cells = row.Cells

                    jabatan_cell = cells.Item(jabatan_idx + 1)
                    unit_cell = cells.Item(unit_idx + 1) if unit_idx is not None else None
                    hal_cell = cells.Item(hal_idx + 1) if hal_idx is not None else None

                    jabatan_raw = extract_bullet_marked_text(jabatan_cell)
                    unit_raw = extract_bullet_marked_text(unit_cell) if unit_cell else ""
                    hal_raw = extract_bullet_marked_text(hal_cell) if hal_cell else ""

                    # jabatan_items = split_items(jabatan_raw)
                    jabatan_items = " ".join([item.strip() for item in jabatan_raw.split("|||") if item.strip()])
                    # unit_items = split_items(unit_raw)
                    unit_items = " ".join([item.strip() for item in unit_raw.split("|||") if item.strip()])
                    hal_items = split_items(hal_raw)

                    korelasi_list.append({
                        "no": str(len(korelasi_list) + 1),
                        "jabatan": jabatan_items,
                        "unit_kerja_instansi": unit_items,
                        "dalam_hal": hal_items
                    })
                break
    except Exception as e:
        print(f"❌ Gagal ekstrak korelasi jabatan: {e}")

    return korelasi_list

def extract_kondisi_lingkungan_kerja(doc):
    kondisi_list = []

    try:
        for table in doc.Tables:
            headers = [clean(cell.Range.Text).lower().strip() for cell in table.Rows.Item(1).Cells]

            if "aspek" in headers and "faktor" in headers:
                aspek_idx = headers.index("aspek")
                faktor_idx = headers.index("faktor")

                for i in range(2, table.Rows.Count + 1):
                    row = table.Rows.Item(i)
                    cells = row.Cells

                    aspek_cell = cells.Item(aspek_idx + 1)
                    faktor_cell = cells.Item(faktor_idx + 1)

                    aspek_raw = extract_bullet_marked_text(aspek_cell)
                    faktor_raw = extract_bullet_marked_text(faktor_cell)

                    # aspek_items = split_items(aspek_raw)
                    aspek_items = " ".join([item.strip() for item in aspek_raw.split("|||") if item.strip()])
                    # faktor_items = split_items(faktor_raw)
                    faktor_items = " ".join([item.strip() for item in faktor_raw.split("|||") if item.strip()])

                    kondisi_list.append({
                        "no": str(len(kondisi_list) + 1),
                        "aspek": aspek_items,
                        "faktor": faktor_items
                    })
                break
    except Exception as e:
        print(f"❌ Gagal ekstrak kondisi lingkungan kerja: {e}")

    return kondisi_list

def extract_bullet_marked_text(cell):
    bullet_text = []

    for para in cell.Range.Paragraphs:
        text = clean(para.Range.Text)
        if not text:
            continue

        # Deteksi bullet/numbering asli
        if para.Range.ListFormat.ListType != 0:
            bullet_text.append(f"|||{text}")
        else:
            bullet_text.append(text)

    return " ".join(bullet_text)

def split_items(text):
    return [item.strip() for item in text.split("|||") if item.strip()]

def extract_deskripsi_dan_tahapan(cell):
    deskripsi = ""
    tahapan = []
    current_is_tahapan = False

    for para in cell.Range.Paragraphs:
        text = clean(para.Range.Text)
        if not text:
            continue

        if "tahapan" in text.lower().strip(":").strip():
            current_is_tahapan = True
            continue

        if not current_is_tahapan:
            deskripsi += (" " if deskripsi else "") + text
        else:
            tahapan.append(text)

    return deskripsi.strip(), tahapan

def extract_risiko_bahaya(doc):
    risiko_list = []

    try:
        for table in doc.Tables:
            headers = [clean(cell.Range.Text).lower().strip() for cell in table.Rows.Item(1).Cells]

            if "nama risiko" in headers and "penyebab" in headers:
                risiko_idx = headers.index("nama risiko")
                penyebab_idx = headers.index("penyebab")

                for i in range(2, table.Rows.Count + 1):
                    row = table.Rows.Item(i)
                    cells = row.Cells

                    risiko_cell = cells.Item(risiko_idx + 1)
                    penyebab_cell = cells.Item(penyebab_idx + 1)

                    risiko_raw = extract_bullet_marked_text(risiko_cell)
                    penyebab_raw = extract_bullet_marked_text(penyebab_cell)

                    # risiko_items = split_items(risiko_raw)
                    risiko_items = " ".join([item.strip() for item in risiko_raw.split("|||") if item.strip()])
                    # penyebab_items = split_items(penyebab_raw)
                    penyebab_items = " ".join([item.strip() for item in penyebab_raw.split("|||") if item.strip()])

                    risiko_list.append({
                        "no": str(len(risiko_list) + 1),
                        "nama_risiko": risiko_items,
                        "penyebab": penyebab_items
                    })
                break
    except Exception as e:
        print(f"❌ Gagal ekstrak risiko bahaya: {e}")

    return risiko_list

def extract_syarat_jabatan(doc):
    syarat = {
        "keterampilan_kerja": [],
        "bakat_kerja": [],
        "temperamen_kerja": [],
        "minat_kerja": [],
        "upaya_fisik": [],
        "kondisi_fisik": {
            "jenis_kelamin": "",
            "umur": "",
            "tinggi_badan": "",
            "berat_badan": "",
            "postur_badan": "",
            "penampilan": "",
            "keadaan_fisik": ""
        },
        "fungsi_pekerja": []
    }

    current = None
    kondisi_field_map = {
        "jenis kelamin": "jenis_kelamin",
        "umur": "umur",
        "tinggi badan": "tinggi_badan",
        "berat badan": "berat_badan",
        "postur badan": "postur_badan",
        "penampilan": "penampilan",
        "keadaan fisik": "keadaan_fisik"
    }

    started = False
    lines = [clean(p.Range.Text) for p in doc.Paragraphs if clean(p.Range.Text)]
    i = 0
    while i < len(lines):
        text = lines[i].strip()
        lower = text.lower().strip(" :")

        if "syarat jabatan" in lower:
            started = True
            i += 1
            continue
        if not started:
            i += 1
            continue
        if "prestasi yang diharapkan" in lower:
            break

        # Deteksi heading
        if lower.startswith("a.") or lower == "keterampilan kerja":
            current = "keterampilan_kerja"
        elif lower.startswith("b.") or lower == "bakat kerja":
            current = "bakat_kerja"
        elif lower.startswith("c.") or lower == "temperamen kerja":
            current = "temperamen_kerja"
        elif lower.startswith("d.") or lower == "minat kerja":
            current = "minat_kerja"
        elif lower.startswith("e.") or lower == "upaya fisik":
            current = "upaya_fisik"
        elif lower.startswith("f.") or lower == "kondisi fisik":
            current = "kondisi_fisik"
        elif lower.startswith("g.") or lower == "fungsi pekerja":
            current = "fungsi_pekerja"
        elif current == "kondisi_fisik":
            # Format bisa berupa:
            # Line i: "1) Jenis Kelamin", Line i+1: ":", Line i+2: "Pria/Wanita"
            if (i + 2 < len(lines)
                and lines[i + 1].strip() == ":"
                and lines[i + 2].strip()):
                label = re.sub(r"^\d+\)", "", lines[i]).strip().lower()
                mapped = kondisi_field_map.get(label)
                if mapped:
                    syarat["kondisi_fisik"][mapped] = lines[i + 2].strip()
                    i += 2  # skip ahead
        elif current in syarat and text != ":":
            if re.match(r"^[a-g]\.$", text.lower()):
                pass
            elif current == "fungsi_pekerja" and "prestasi" in lower:
                break
            else:
                syarat[current].append(text)
        i += 1

    # Tambahan: split by comma untuk keterampilan dan upaya fisik
    def split_by_comma(arr):
        result = []
        for item in arr:
            parts = [part.strip() for part in item.split(",") if part.strip()]
            result.extend(parts)
        return result

    syarat["keterampilan_kerja"] = split_by_comma(syarat["keterampilan_kerja"])
    syarat["upaya_fisik"] = split_by_comma(syarat["upaya_fisik"])

    return syarat

def extract_prestasi_dan_kelas(doc):
    lines = [clean(p.Range.Text) for p in doc.Paragraphs if clean(p.Range.Text)]
    prestasi = "---"
    kelas = "---"

    for i, line in enumerate(lines):
        lower = line.lower().strip()

        if "prestasi yang diharapkan" in lower and i + 1 < len(lines):
            prestasi = lines[i + 1].strip()
        elif "kelas jabatan" in lower and i + 1 < len(lines):
            kelas = lines[i + 1].strip()

    return prestasi, kelas

def extract_info(file_path):
    ext = os.path.splitext(file_path)[-1].lower()
    if ext == ".docx":
        doc, lines = read_docx(file_path)
        close_word = False  # tidak perlu tutup Word jika .docx
    elif ext == ".doc":
        word = Dispatch("Word.Application")
        word.Visible = False
        doc = word.Documents.Open(os.path.abspath(file_path))
        text = doc.Content.Text
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        close_word = True
    else:
        raise ValueError("File tidak didukung: " + file_path)

    try:
        prestasi, kelas = extract_prestasi_dan_kelas(doc)

        return {
            "file": os.path.basename(file_path),
            "nama_jabatan": extract_line_value("NAMA JABATAN", lines),
            "kode_jabatan": extract_line_value("KODE JABATAN", lines),
            "unit_kerja": extract_unit_kerja(lines),
            "ikhtisar_jabatan": extract_block("IKHTISAR JABATAN", "KUALIFIKASI JABATAN", lines),
            "kualifikasi_jabatan": extract_kualifikasi(lines),
            "tugas_pokok": extract_tugas_pokok(doc),
            "hasil_kerja": extract_hasil_kerja(doc),
            "bahan_kerja": extract_bahan_kerja(doc),
            "perangkat_kerja": extract_perangkat_kerja(doc),
            "tanggung_jawab": extract_tanggung_jawab(doc),
            "wewenang": extract_wewenang(doc),
            "korelasi_jabatan": extract_korelasi_jabatan(doc),
            "kondisi_lingkungan_kerja": extract_kondisi_lingkungan_kerja(doc),
            "risiko_bahaya": extract_risiko_bahaya(doc),
            "syarat_jabatan": extract_syarat_jabatan(doc),
            "prestasi_yang_diharapkan": prestasi,
            "kelas_jabatan": kelas
        }
    finally:
        if ext == ".doc" and close_word:
            doc.Close(False)
            word.Quit()

# ====================== MAIN ======================
# if __name__ == "__main__":
#     folder_path = "."
#     files = [f for f in os.listdir(folder_path)
#              if f.lower().endswith(('.doc', '.docx')) and not f.startswith('~$')]

#     if not files:
#         print("❌ Tidak ada file .doc/.docx ditemukan.")
#     else:
#         for file in files:
#             try:
#                 print(f"▶️ Memproses: {file}")
#                 data = extract_info(os.path.join(folder_path, file))

#                 json_file_name = f"{os.path.splitext(file)[0]}.json"
#                 with open(json_file_name, "w", encoding="utf-8") as f:
#                     json.dump(data, f, indent=2, ensure_ascii=False)

#                 print(f"✅ Hasil disimpan di: {json_file_name}")

#             except Exception as e:
#                 print(f"❌ Gagal memproses {file}: {e}")

import sys

if __name__ == "__main__":
    file_path = globals().get("__file_path__", None)

    if not file_path:
        if len(sys.argv) >= 2:
            file_path = sys.argv[1]

    if file_path:
        try:
            data = extract_info(file_path)
            print(json.dumps(data, ensure_ascii=False))
        except Exception as e:
            print(f"❌ Error: {str(e)}", file=sys.stderr)
            sys.exit(1)
    else:
        print("❌ Argumen tidak lengkap: butuh file .doc/.docx", file=sys.stderr)
        sys.exit(1)

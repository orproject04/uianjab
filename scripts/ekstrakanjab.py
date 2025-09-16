import os
import re
import json
import tempfile
import subprocess
from docx import Document
from docx.oxml.ns import qn

# -------------------- UTIL --------------------

def clean(text: str) -> str:
    # Samakan dengan versi Anda (hapus BEL \u0007, CR, TAB, VT, FF)
    return re.sub(r'[\u0007\r\t\x0b\x0c]', '', (text or '')).strip()

def is_list_paragraph(p) -> bool:
    """
    Deteksi bullet/numbering tanpa COM:
    Cek keberadaan w:numPr pada w:pPr.
    """
    try:
        pPr = p._p.pPr
        if pPr is None:
            return False
        numPr = pPr.find(qn('w:numPr'))
        return numPr is not None
    except Exception:
        return False

def para_text(p) -> str:
    return clean(p.text)

def cell_text(cell) -> str:
    # .text sudah gabungkan semua paragraph
    return clean(cell.text)

def table_header_cells(table):
    # Ambil row pertama sebagai header
    hdr = []
    if table.rows:
        for c in table.rows[0].cells:
            hdr.append(cell_text(c).lower())
    return hdr

def split_items(text: str):
    return [item.strip() for item in (text or '').split("|||") if item.strip()]

def iter_block_items(doc):
    """
    Iterasi block (paragraph/table) dalam urutan aslinya.
    Sumber: pola umum python-docx.
    """
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.table import _Cell, Table
    from docx.text.paragraph import Paragraph

    parent_elm = doc.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield ("p", Paragraph(child, doc))
        elif isinstance(child, CT_Tbl):
            yield ("t", Table(child, doc))

# -------------------- READER --------------------

def read_docx(file_path):
    doc = Document(file_path)
    lines = [para_text(p) for p in doc.paragraphs if para_text(p)]
    return doc, lines

def convert_doc_to_docx_via_libreoffice(src_path: str) -> str:
    """
    Konversi .doc -> .docx via LibreOffice headless. Return path .docx di temp.
    """
    tmpdir = tempfile.mkdtemp(prefix="doc2docx_")
    cmd = [
        "soffice", "--headless", "--convert-to", "docx", src_path, "--outdir", tmpdir
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        raise RuntimeError(f"Gagal konversi .doc ke .docx dengan LibreOffice: {e}")
    base = os.path.splitext(os.path.basename(src_path))[0]
    out = os.path.join(tmpdir, base + ".docx")
    if not os.path.exists(out):
        raise RuntimeError("File hasil konversi .docx tidak ditemukan.")
    return out

def read_doc(file_path):
    # Gantikan COM: konversi ke .docx lalu baca dengan python-docx
    docx_path = convert_doc_to_docx_via_libreoffice(file_path)
    return read_docx(docx_path)

# -------------------- EXTRACTORS (preserve JSON shape) --------------------

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

def extract_kualifikasi(doc):
    """
    Baca tabel KUALIFIKASI JABATAN (3 kolom, 6 baris):
    - Kolom 1 (baris 1): 'Pendidikan Formal' -> ambil kolom 3 baris 1 -> array
    - Kolom 1 (baris 3): 'Diklat Penjenjangan' -> kolom 3 baris 3 -> array
    - Kolom 1 (baris 4): 'Diklat Teknis' -> kolom 3 baris 4 -> array
    - Kolom 1 (baris 5): 'Diklat Fungsional' -> kolom 3 baris 5 -> array
    - Kolom 1 (baris 6): 'Pengalaman Kerja' -> kolom 3 baris 6 -> array
    (Baris 2 biasanya 'Pendidikan dan Pelatihan' → dilewati)
    """
    result = {
        "pendidikan_formal": [],
        "pendidikan_dan_pelatihan": {
            "diklat_penjenjangan": [],
            "diklat_teknis": [],
            "diklat_fungsional": []
        },
        "pengalaman_kerja": []
    }

    def tidy(s: str) -> str:
        s = (s or "").replace("\u00A0", " ")
        s = re.sub(r"[\u0000-\u001F]", "", s)
        s = s.strip().strip(":;")
        # buang bullet/nomor di depan
        s = re.sub(r"^\s*(?:[\u2022\-\–\—\*•]+|\(?\d+[\.\)])\s*", "", s)
        return s.strip()

    def cell_to_list(cell):
        items = []
        # ambil per paragraf agar butir jadi list
        for p in cell.paragraphs:
            t = tidy(p.text)
            if not t or t in {"-", "–", "—", ":"}:
                continue
            items.append(t)
        if items:
            return items
        # fallback: split newline
        txt = tidy(cell.text)
        return [x for x in (ln.strip() for ln in txt.splitlines()) if x]

    # cari tabel kandidat: punya ≥ 6 baris, tiap baris punya ≥ 3 kolom,
    # dan kolom-1 mengandung beberapa label yang kita kenal
    LABELS = (
        "pendidikan formal",
        "diklat penjenjangan",
        "diklat teknis",
        "diklat fungsional",
        "pengalaman kerja",
    )

    def table_score(tbl):
        if len(tbl.rows) < 6:
            return -1
        if any(len(r.cells) < 3 for r in tbl.rows[:6]):
            return -1
        labels = [tidy(r.cells[0].text).lower() for r in tbl.rows[:6]]
        return sum(any(lab in x for lab in LABELS) for x in labels)

    candidate = None
    best = -1
    for t in doc.tables:
        sc = table_score(t)
        if sc > best:
            best = sc
            candidate = t

    if not candidate or best < 3:
        # Tidak ketemu tabel yang cocok → kembalikan kosong (struktur sama)
        return result

    # mapping per baris berdasarkan isi kolom-1
    for idx, row in enumerate(candidate.rows, start=1):
        c1 = tidy(row.cells[0].text).lower()
        if len(row.cells) < 3:
            continue
        val_items = cell_to_list(row.cells[2])

        if not val_items:
            continue

        if "pendidikan formal" in c1:
            result["pendidikan_formal"] = val_items

        elif "diklat penjenjangan" in c1:
            result["pendidikan_dan_pelatihan"]["diklat_penjenjangan"] = val_items

        elif "diklat teknis" in c1:
            result["pendidikan_dan_pelatihan"]["diklat_teknis"] = val_items

        elif "diklat fungsional" in c1:
            result["pendidikan_dan_pelatihan"]["diklat_fungsional"] = val_items

        elif "pengalaman kerja" in c1:
            result["pengalaman_kerja"] = val_items

        # baris 2 ('Pendidikan dan Pelatihan') → skip otomatis

    return result


def extract_bullet_marked_text_cell(cell) -> str:
    """
    Replikasi versi COM:
    - Jika paragraf ber-numbering/bullet → prefix '|||'
    - Jika bukan → langsung gabung.
    """
    chunks = []
    for p in cell.paragraphs:
        t = para_text(p)
        if not t:
            continue
        if is_list_paragraph(p):
            chunks.append(f"|||{t}")
        else:
            chunks.append(t)
    return " ".join(chunks)

def extract_deskripsi_dan_tahapan_cell(cell):
    deskripsi = ""
    tahapan = []
    current_is_tahapan = False
    for p in cell.paragraphs:
        text = para_text(p)
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

# ---------- Bagian tabel: gunakan table_header_cells() untuk map kolom ----------

def extract_tugas_pokok(doc):
    tugas_list = []
    for table in doc.tables:
        headers = table_header_cells(table)
        if not headers:
            continue
        if ("uraian tugas" in headers) and ("hasil kerja" in headers):
            uraian_idx = headers.index("uraian tugas")
            hasil_idx = headers.index("hasil kerja")

            for r in table.rows[1:]:
                cells = r.cells
                if len(cells) <= max(uraian_idx, hasil_idx):
                    continue

                deskripsi, tahapan = extract_deskripsi_dan_tahapan_cell(cells[uraian_idx])
                hasil_raw = extract_bullet_marked_text_cell(cells[hasil_idx])
                hasil_items = split_items(hasil_raw)

                # Filter baris invalid
                if deskripsi.strip(". -").strip().lower() in ["", "...........", "..........", "-", "–"]:
                    continue
                if hasil_raw.strip(". -").strip().lower() in ["", "...........", "..........", "-", "–"]:
                    continue

                no = str(len(tugas_list) + 1)
                no_text = no.strip().lower()
                uraian_text = deskripsi.strip().lower()
                if ("jumlah" in no_text or "jumlah pegawai" in no_text
                    or "jumlah" in uraian_text or "jumlah pegawai" in uraian_text):
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
    for table in doc.tables:
        headers = table_header_cells(table)
        if not headers:
            continue
        if ("hasil kerja" in headers) and ("satuan hasil" in headers):
            hasil_idx = headers.index("hasil kerja")
            satuan_idx = headers.index("satuan hasil")
            for r in table.rows[1:]:
                cells = r.cells
                if len(cells) <= max(hasil_idx, satuan_idx):
                    continue
                hasil_raw = extract_bullet_marked_text_cell(cells[hasil_idx])
                satuan_raw = extract_bullet_marked_text_cell(cells[satuan_idx])
                hasil_items = split_items(hasil_raw) or []
                satuan_items = split_items(satuan_raw) or []
                hasil_list.append({
                    "no": str(len(hasil_list) + 1),
                    "hasil_kerja": hasil_items,
                    "satuan_hasil": satuan_items
                })
    return hasil_list

def extract_bahan_kerja(doc):
    bahan_list = []
    for table in doc.tables:
        headers = table_header_cells(table)
        if not headers:
            continue
        if ("bahan kerja" in headers) and ("penggunaan dalam tugas" in headers):
            b_idx = headers.index("bahan kerja")
            p_idx = headers.index("penggunaan dalam tugas")
            for r in table.rows[1:]:
                cells = r.cells
                if len(cells) <= max(b_idx, p_idx):
                    continue
                bahan_items = split_items(extract_bullet_marked_text_cell(cells[b_idx])) or []
                penggunaan_items = split_items(extract_bullet_marked_text_cell(cells[p_idx])) or []
                bahan_list.append({
                    "no": str(len(bahan_list) + 1),
                    "bahan_kerja": bahan_items,
                    "penggunaan_dalam_tugas": penggunaan_items
                })
    return bahan_list

def extract_perangkat_kerja(doc):
    perangkat_list = []
    try:
        for table in doc.tables:
            headers = table_header_cells(table)
            if not headers:
                continue
            if ("perangkat kerja" in headers) and any("penggunaan" in h for h in headers):
                perangkat_idx = headers.index("perangkat kerja")
                penggunaan_idx = next((i for i, h in enumerate(headers) if "penggunaan" in h), None)
                for r in table.rows[1:]:
                    cells = r.cells
                    perangkat_raw = extract_bullet_marked_text_cell(cells[perangkat_idx])
                    penggunaan_raw = extract_bullet_marked_text_cell(cells[penggunaan_idx]) if penggunaan_idx is not None else ""
                    perangkat_list.append({
                        "no": str(len(perangkat_list) + 1),
                        "perangkat_kerja": split_items(perangkat_raw),
                        "penggunaan_untuk_tugas": split_items(penggunaan_raw)
                    })
                break
    except Exception as e:
        print(f"❌ Gagal ekstrak perangkat kerja: {e}")
    return perangkat_list

def extract_table_after_heading(doc, heading_keywords=("tanggung jawab",), required_headers=("no.", "uraian")):
    """
    Util umum: cari heading paragraf (contains any keyword), ambil tabel pertama setelahnya
    yang headernya mengandung required_headers.
    """
    seen_heading = False
    for kind, obj in iter_block_items(doc):
        if kind == "p":
            txt = para_text(obj).lower()
            if any(k in txt for k in heading_keywords):
                seen_heading = True
        elif kind == "t" and seen_heading:
            headers = table_header_cells(obj)
            if all(h in headers for h in required_headers):
                return obj
            # kalau tabel pertama tidak cocok, lanjut cari tabel berikutnya sampai cocok
    return None

def extract_tanggung_jawab(doc):
    tanggung_list = []
    table = extract_table_after_heading(doc, ("tanggung jawab",), ("no.", "uraian"))
    if not table:
        return tanggung_list
    headers = table_header_cells(table)
    uraian_idx = headers.index("uraian")
    for r in table.rows[1:]:
        uraian_raw = extract_bullet_marked_text_cell(r.cells[uraian_idx])
        uraian_cleaned = " ".join([item.strip() for item in uraian_raw.split("|||") if item.strip()])
        tanggung_list.append({
            "no": str(len(tanggung_list) + 1),
            "uraian": uraian_cleaned
        })
    return tanggung_list

def extract_wewenang(doc):
    wewenang_list = []
    table = extract_table_after_heading(doc, ("wewenang",), ("no.", "uraian"))
    if not table:
        return wewenang_list
    headers = table_header_cells(table)
    uraian_idx = headers.index("uraian")
    for r in table.rows[1:]:
        uraian_raw = extract_bullet_marked_text_cell(r.cells[uraian_idx])
        uraian_cleaned = " ".join([item.strip() for item in uraian_raw.split("|||") if item.strip()])
        wewenang_list.append({
            "no": str(len(wewenang_list) + 1),
            "uraian": uraian_cleaned
        })
    return wewenang_list

def extract_korelasi_jabatan(doc):
    korelasi_list = []
    try:
        for table in doc.tables:
            headers = table_header_cells(table)
            if not headers:
                continue
            if ("jabatan" in headers
                and any(h in headers for h in ["unit kerja/instansi", "unit kerja", "instansi"])
                and any("dalam hal" in h for h in headers)):
                jabatan_idx = headers.index("jabatan")
                unit_idx = next((i for i, h in enumerate(headers) if "unit kerja" in h or "instansi" in h), None)
                hal_idx = next((i for i, h in enumerate(headers) if "dalam hal" in h), None)
                for r in table.rows[1:]:
                    cells = r.cells
                    jabatan_raw = extract_bullet_marked_text_cell(cells[jabatan_idx])
                    unit_raw = extract_bullet_marked_text_cell(cells[unit_idx]) if unit_idx is not None else ""
                    hal_raw = extract_bullet_marked_text_cell(cells[hal_idx]) if hal_idx is not None else ""
                    jabatan_items = " ".join([i.strip() for i in jabatan_raw.split("|||") if i.strip()])
                    unit_items = " ".join([i.strip() for i in unit_raw.split("|||") if i.strip()])
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
        for table in doc.tables:
            headers = table_header_cells(table)
            if not headers:
                continue
            if ("aspek" in headers) and ("faktor" in headers):
                aspek_idx = headers.index("aspek")
                faktor_idx = headers.index("faktor")
                for r in table.rows[1:]:
                    aspek_raw = extract_bullet_marked_text_cell(r.cells[aspek_idx])
                    faktor_raw = extract_bullet_marked_text_cell(r.cells[faktor_idx])
                    aspek_items = " ".join([i.strip() for i in aspek_raw.split("|||") if i.strip()])
                    faktor_items = " ".join([i.strip() for i in faktor_raw.split("|||") if i.strip()])
                    kondisi_list.append({
                        "no": str(len(kondisi_list) + 1),
                        "aspek": aspek_items,
                        "faktor": faktor_items
                    })
                break
    except Exception as e:
        print(f"❌ Gagal ekstrak kondisi lingkungan kerja: {e}")
    return kondisi_list

def extract_risiko_bahaya(doc):
    risiko_list = []
    try:
        for table in doc.tables:
            headers = table_header_cells(table)
            if not headers:
                continue
            if ("nama risiko" in headers) and ("penyebab" in headers):
                risiko_idx = headers.index("nama risiko")
                penyebab_idx = headers.index("penyebab")
                for r in table.rows[1:]:
                    risiko_raw = extract_bullet_marked_text_cell(r.cells[risiko_idx])
                    penyebab_raw = extract_bullet_marked_text_cell(r.cells[penyebab_idx])
                    risiko_items = " ".join([i.strip() for i in risiko_raw.split("|||") if i.strip()])
                    penyebab_items = " ".join([i.strip() for i in penyebab_raw.split("|||") if i.strip()])
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
    result = {
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

    import re

    # ---------- Helpers ----------
    def tidy(s: str) -> str:
        s = (s or "").replace("\u00A0", " ")
        s = re.sub(r"[\u0000-\u001F]", "", s)
        s = s.strip().strip(":;")
        # buang bullet/numbering di depan
        s = re.sub(r"^\s*(?:[\u2022\-\–\—\*•]+|\(?\d+[\.\)])\s*", "", s)
        return s.strip()

    def is_letter_tag(s: str) -> bool:
        """
        Tag huruf kolom-1: terima variasi 'g', 'g.', '(g)', 'g)', 'g :', 'g -', dst.
        Logika: hapus spasi & tanda baca umum, sisa tepat 1 huruf.
        """
        low = tidy(s).lower()
        core = re.sub(r"[\s\.\:\)\(\-–—]+", "", low)  # buang spasi & punct umum
        return len(core) == 1 and core.isalpha()

    def cell_items_list(cell) -> list[str]:
        items = []
        if cell is None:
            return items
        for p in cell.paragraphs:
            t = tidy(p.text)
            if not t or t in {"-", "–", "—", ":"}:
                continue
            items.append(t)
        if items:
            return items
        # fallback: split by newline
        txt = tidy(cell.text)
        return [x for x in (ln.strip() for ln in txt.splitlines()) if x]

    # prefer kolom-4, fallback kolom-3 (kalau kolom-3 bukan ":" kosong)
    def value_items_from_row(c3, c4) -> list[str]:
        v4 = cell_items_list(c4)
        if v4:
            return v4
        t3 = tidy(c3.text) if c3 is not None else ""
        if t3 and t3 != ":":
            return cell_items_list(c3)
        return []

    # khusus fungsi_pekerja: 4 -> 3 -> 2
    def value_items_for_fungsi(c2, c3, c4) -> list[str]:
        v = value_items_from_row(c3, c4)
        if v:
            return v
        return cell_items_list(c2)

    KEY_MAP = {
        "keterampilan kerja": "keterampilan_kerja",
        "bakat kerja": "bakat_kerja",
        "temperamen kerja": "temperamen_kerja",
        "minat kerja": "minat_kerja",
        "upaya fisik": "upaya_fisik",
        "kondisi fisik": "kondisi_fisik",
        "fungsi pekerja": "fungsi_pekerja",
    }
    CF_MAP = {
        "jenis kelamin": "jenis_kelamin",
        "umur": "umur",
        "tinggi badan": "tinggi_badan",
        "berat badan": "berat_badan",
        "postur badan": "postur_badan",
        "penampilan": "penampilan",
        "keadaan fisik": "keadaan_fisik",
    }

    def detect_key(label: str) -> str | None:
        low = tidy(label).lower()
        for k, v in KEY_MAP.items():
            if k in low:
                return v
        return None

    def detect_cf_field(label: str) -> str | None:
        low = tidy(label).lower()
        for k, v in CF_MAP.items():
            if k in low:
                return v
        return None

    def dedup_keep_order(seq: list[str]) -> list[str]:
        out, seen = [], set()
        for s in seq:
            t = tidy(s)
            if not t:
                continue
            if t not in seen:
                seen.add(t)
                out.append(t)
        return out

    # ---------- Pilih tabel kandidat ----------
    def table_score(tbl) -> int:
        probe = min(8, len(tbl.rows)) or 1
        if any(len(r.cells) < 4 for r in tbl.rows[:probe]):
            return -1
        score = 0
        for r in tbl.rows:
            c2 = tidy(r.cells[1].text) if len(r.cells) >= 2 else ""
            if detect_key(c2):
                score += 1
        return score

    candidate, best = None, -1
    for t in doc.tables:
        sc = table_score(t)
        if sc > best:
            best = sc
            candidate = t
    if not candidate or best <= 0:
        return result

    # ---------- Parse baris per baris ----------
    current_key: str | None = None
    in_kondisi = False

    for row in candidate.rows:
        if len(row.cells) < 4:
            continue

        c1, c2, c3, c4 = row.cells[0], row.cells[1], row.cells[2], row.cells[3]
        t1, t2 = tidy(c1.text), tidy(c2.text)

        has_letter = is_letter_tag(t1)
        key_here = detect_key(t2)
        vals_34 = value_items_from_row(c3, c4)

        # 1) Header key: ada huruf & ada label key
        if has_letter and key_here:
            current_key = key_here
            in_kondisi = (current_key == "kondisi_fisik")
            if in_kondisi:
                continue  # header kondisi_fisik umumnya tanpa nilai
            # fungsi_pekerja: 4 -> 3 -> 2
            vals = value_items_for_fungsi(c2, c3, c4) if current_key == "fungsi_pekerja" else vals_34
            if vals:
                result[current_key].extend(vals)
            continue

        # 1b) MERGED-LETTER continuation (kolom-1 masih 'g'/'g.' tapi kolom-2 kosong):
        if has_letter and (not key_here) and current_key and (current_key != "kondisi_fisik"):
            vals = value_items_for_fungsi(c2, c3, c4) if current_key == "fungsi_pekerja" else vals_34
            if vals:
                result[current_key].extend(vals)  # menangkap item pertama semisal "D0 = ..."
            continue

        # 2) Lanjutan key biasa: tanpa huruf & tanpa label key
        if (not has_letter) and (not key_here) and current_key and (current_key != "kondisi_fisik"):
            vals = value_items_for_fungsi(c2, c3, c4) if current_key == "fungsi_pekerja" else vals_34
            if vals:
                result[current_key].extend(vals)
            continue

        # 3) Mode kondisi_fisik: kolom-2 = sub-field, kolom-4/3 = nilainya (single)
        if in_kondisi and (not has_letter) and t2:
            cf_field = detect_cf_field(t2)
            if cf_field:
                val_single = " ".join(vals_34).strip()
                if val_single:
                    result["kondisi_fisik"][cf_field] = val_single
            continue

        # 4) Baris tanpa huruf tetapi ada key di kolom-2 → mulai key baru
        if (not has_letter) and key_here:
            current_key = key_here
            in_kondisi = (current_key == "kondisi_fisik")
            if in_kondisi:
                continue
            vals = value_items_for_fungsi(c2, c3, c4) if current_key == "fungsi_pekerja" else vals_34
            if vals:
                result[current_key].extend(vals)
            continue

        # 5) Penutup mode kondisi_fisik jika ada huruf tapi label kosong
        if has_letter and not key_here and in_kondisi:
            in_kondisi = False
            current_key = None
            continue

    # ---------- Fallback khusus: fungsi_pekerja masih kosong → scan ulang ----------
    if not result["fungsi_pekerja"]:
        rows = candidate.rows
        start_idx = None
        for i, r in enumerate(rows):
            if len(r.cells) < 4:
                continue
            lbl = tidy(r.cells[1].text).lower()
            if "fungsi pekerja" in lbl:
                start_idx = i
                break
        if start_idx is not None:
            for j in range(start_idx + 1, len(rows)):
                r = rows[j]
                if len(r.cells) < 4:
                    continue
                nxt_lbl = tidy(r.cells[1].text).lower()
                if any(k in nxt_lbl for k in KEY_MAP.keys() if k != "fungsi pekerja"):
                    break
                vals = value_items_for_fungsi(r.cells[1], r.cells[2], r.cells[3])  # 4 -> 3 -> 2
                if vals:
                    result["fungsi_pekerja"].extend(vals)

    # ---------- Rapikan ----------
    for k in ("keterampilan_kerja", "bakat_kerja", "temperamen_kerja",
              "minat_kerja", "upaya_fisik", "fungsi_pekerja"):
        result[k] = dedup_keep_order(result[k])

    return result


def extract_prestasi_dan_kelas(doc):
    lines = [para_text(p) for p in doc.paragraphs if para_text(p)]
    prestasi = "---"
    kelas = "---"
    for i, line in enumerate(lines):
        lower = line.lower().strip()
        if "prestasi yang diharapkan" in lower and i + 1 < len(lines):
            prestasi = lines[i + 1].strip()
        elif "kelas jabatan" in lower and i + 1 < len(lines):
            kelas = lines[i + 1].strip()
    return prestasi, kelas

# -------------------- ORKESTRATOR --------------------

def extract_info(file_path):
    ext = os.path.splitext(file_path)[-1].lower()
    if ext == ".docx":
        doc, lines = read_docx(file_path)
    elif ext == ".doc":
        doc, lines = read_doc(file_path)  # konversi via LibreOffice, lalu python-docx
    else:
        raise ValueError("File tidak didukung: " + file_path)

    prestasi, kelas = extract_prestasi_dan_kelas(doc)
    return {
        "file": os.path.basename(file_path),
        "nama_jabatan": extract_line_value("NAMA JABATAN", lines),
        "kode_jabatan": extract_line_value("KODE JABATAN", lines),
        "unit_kerja": extract_unit_kerja(lines),
        "ikhtisar_jabatan": extract_block("IKHTISAR JABATAN", "KUALIFIKASI JABATAN", lines),
        "kualifikasi_jabatan": extract_kualifikasi(doc),
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

# -------------------- CLI --------------------

if __name__ == "__main__":
    import sys
    file_path = globals().get("__file_path__", None)
    if not file_path and len(sys.argv) >= 2:
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

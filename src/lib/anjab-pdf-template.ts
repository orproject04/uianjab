// src/lib/anjab-pdf-template.ts

// ===== Helper yang tadinya di route =====
function renderList(arr?: string[]) {
    if (!arr || arr.length === 0) return "-";
    return `<ul style="margin:0; padding-left:0px; list-style-type: none;">${arr.map(item => `<li>${item}</li>`).join("")}</ul>`;
}

function renderNumberList(arr?: string[]) {
    if (!arr || arr.length === 0) return "-";
    return `<ol style="margin:0; padding-left:15px;">${arr.map(item => `<li>${item}</li>`).join("")}</ol>`;
}

function renderBulletList(value: string | string[]) {
    if (Array.isArray(value)) {
        return `
      <ul style="margin:0; padding-left:1.5em; list-style-type: disc;">
        ${value.map((sub) => `<li>${sub}</li>`).join("")}
      </ul>
    `;
    }
    return value;
}

function renderTableList(value: string | string[]) {
    if (Array.isArray(value) && value.length > 0) {
        if (value.length === 1) return value[0];
        const skipNumbering = value[0].trim().endsWith(":");
        return `
      <ol style="margin:0; padding-left:0; list-style:none;">
        ${value
            .map((sub, i) => {
                if (i === 0 && skipNumbering) {
                    return `<li style="margin:0; padding:0;">${sub}</li>`;
                } else {
                    const numIndex = skipNumbering ? i - 1 : i;
                    return `
                <li style="margin:0; padding:0; display:flex;">
                  <span style="flex-shrink:0; width:1.5em;">${String.fromCharCode(97 + numIndex)}.</span>
                  <span style="flex:1;">${sub}</span>
                </li>
              `;
                }
            })
            .join("")}
      </ol>
    `;
    }
    return value;
}

function renderUraianTugasDanTahapan(item: any) {
    const uraian = renderTableList(item.uraian_tugas);
    let tahapanHtml = "";
    if (item.tahapan && item.tahapan.length > 0) {
        tahapanHtml = `
      <br><p>Tahapan :</p>
      <ol style="margin:0; padding-left:1.5em; list-style-type: decimal;">
        ${item.tahapan.map((t: any) => `<li style="margin-bottom:2px;">${t.tahapan}</li>`).join("")}
      </ol>
    `;
    }
    return `${uraian}${tahapanHtml}`;
}

// ===== Perangkat Kerja: split & render table multi-halaman =====
function splitPerangkatKeHalaman(data: any[], maxRowsPerPage = 50) {
    const pages: any[] = [];
    let currentPage: any[] = [];
    let rowCount = 0;

    data.forEach((item, index) => {
        const perangkatList = item.perangkat_kerja || [];
        const penggunaanList = item.penggunaan_untuk_tugas || [];
        const total = Math.max(1, perangkatList.length);

        let i = 0;
        while (i < total) {
            const available = maxRowsPerPage - rowCount;

            if (total - i > available && rowCount > 0) {
                pages.push({rows: currentPage, continued: true});
                currentPage = [];
                rowCount = 0;
                continue;
            }

            const take = Math.min(available, total - i);

            for (let j = 0; j < take; j++) {
                const isFirst = (i + j === 0);
                currentPage.push({
                    index,
                    perangkat: perangkatList[i + j] || "",
                    penggunaan: isFirst ? (penggunaanList || []) : null,
                    firstRow: isFirst,
                    totalRowsInItem: total
                });
                rowCount++;
            }

            i += take;

            if (rowCount >= maxRowsPerPage) {
                pages.push({rows: currentPage, continued: true});
                currentPage = [];
                rowCount = 0;
            }
        }
    });

    if (currentPage.length > 0) {
        pages.push({rows: currentPage, continued: false});
    }

    return pages;
}

function renderPerangkatTable(data: any[], maxRowsPerPage = 50) {
    const pages = splitPerangkatKeHalaman(data, maxRowsPerPage);

    return pages.map((page, pageIdx) => {
        const countInPage: Record<number, number> = {};
        page.rows.forEach((r: any) => {
            countInPage[r.index] = (countInPage[r.index] || 0) + 1;
        });

        const emittedInPage: Record<number, number> = {};
        const tbody = page.rows.map((r: any) => {
            const firstInThisPage = !emittedInPage[r.index];
            emittedInPage[r.index] = (emittedInPage[r.index] || 0) + 1;

            let cells = "";

            // NO
            if (firstInThisPage) {
                cells += `<td style="text-align:center" rowspan="${countInPage[r.index]}">${r.index + 1}.</td>`;
            }

            // PERANGKAT
            cells += `<td>${r.perangkat || ""}</td>`;

            // PENGGUNAAN
            if (firstInThisPage) {
                if (r.penggunaan && r.penggunaan.length > 0) {
                    cells += `<td rowspan="${countInPage[r.index]}">${renderTableList(r.penggunaan)}</td>`;
                } else {
                    cells += `<td rowspan="${countInPage[r.index]}"></td>`;
                }
            }

            return `<tr>${cells}</tr>`;
        }).join("");

        const breakStyle = pageIdx < pages.length - 1 ? 'page-break-after:always;' : '';

        return `
      <table style="margin-left:0; width:99%; border-collapse:collapse; ${breakStyle}" class="word-table" border="1">
        <thead>
          <tr>
            <th>NO</th>
            <th>PERANGKAT KERJA</th>
            <th>PENGGUNAAN UNTUK TUGAS</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    `;
    }).join('');
}

// ===== Export utama: bangun HTML lengkap =====
export function buildAnjabHtml(data: any): string {
    const totalKebutuhan = (data.tugas_pokok || []).reduce(
        (sum: number, item: any) => sum + (parseFloat(String(item.kebutuhan_pegawai ?? "0").replace(",", ".")) || 0),
        0
    );

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${data.nama_jabatan}</title>
  <style>
    @page portrait { size: A4 portrait; margin: 2cm 2.5cm 2.38cm 2.3cm; }
    @page landscape { size: A4 landscape; margin: 1.2cm 1.2cm 1.2cm 1.2cm; }
    .section.landscape { page: landscape; }
    .section.portrait { page: portrait; }
    html, body { height: 100%; }
    body { font-family: "Tahoma", Times, serif; font-size: 11pt; line-height: 1.35; color: #000; margin: 0; -webkit-font-smoothing: antialiased; }
    .doc-title { text-align: center; margin-bottom: 19px; }
    .table-section p { page-break-after: avoid; margin: 0; padding: 0; }
    .table-section table { margin: 0; padding: 0; }
    .word-table { page-break-inside: auto; }
    .word-table thead { display: table-header-group; }
    .word-table tr { page-break-inside: avoid; }
    .section { margin-top: 5px; margin-bottom: 20px; }
    .section .title { font-weight: bold; display: block; margin-bottom: 4px; }
    p { margin: 4px 0; text-align: justify; }

    .key-value { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    .key-value td { vertical-align: top; padding: 4px 6px; }
    .key-value td.custom-padding { padding-top: 0; padding-bottom: 0; }
    .kv-left { width: 33%; } .kv-sep { width: 7%; } .kv-right { width: 60%; }

    table.word-table { page-break-inside: auto; width: 100%; border-collapse: collapse; margin: 6px 0 30px 0; table-layout: auto; font-size: 11pt; }
    table.word-table th, table.word-table td { border: 1px solid #000; padding: 6px; vertical-align: top; word-break: normal; white-space: normal; }
    table.word-table th { font-weight: normal; vertical-align: middle; text-align: center; background: #C3C3C3; }

    ol.alpha { list-style-type: lower-alpha; margin: 0 0 0 1.2em; padding: 0; }
    ol.num   { list-style-type: decimal;      margin: 0 0 0 1.2em; padding: 0; }
    ul.simple{ margin: 0 0 0 1.2em; padding: 0; list-style-type: disc; }

    .small { font-size: 10pt; }
    .page-break { page-break-before: always; }
    .center { text-align: center; }
    .two-col { display: flex; gap: 12px; } .two-col > div { flex: 1; }
    .custom-justify { text-align: justify; } .custom-justify:after { content: ""; width: 100%; }
  </style>
</head>
<body>
<div class="doc">
  <!-- 1. NAMA JABATAN -->
  <div class="section portrait">
    <div class="doc-title" style="padding-bottom: 20px">INFORMASI JABATAN</div>
    <table class="key-value">
      <tr><td class="kv-left">1. NAMA JABATAN</td><td class="kv-sep">:</td><td class="kv-right">${data.nama_jabatan}</td></tr>
    </table>
  </div>

  <!-- 2. KODE JABATAN -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left">2. KODE JABATAN</td><td class="kv-sep">:</td><td class="kv-right">${data.kode_jabatan}</td></tr>
    </table>
  </div>

  <!-- 3. UNIT KERJA -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left" style="padding-bottom:5px">3. UNIT KERJA</td><td class="kv-sep" style="padding-bottom:5px;">:</td><td class="kv-right" style="padding-bottom:5px;"></td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">a. JPT Utama</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.jpt_utama}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">b. JPT Madya</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.jpt_madya}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">c. JPT Pratama</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.jpt_pratama}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">d. Administrator</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.administrator}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">e. Pengawas</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.pengawas}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">f. Pelaksana</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.pelaksana}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:35px">g. Jabatan Fungsional</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right">${data.jabatan_fungsional}</td></tr>
    </table>
  </div>

  <!-- 4. IKHTISAR JABATAN -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left">4. IKHTISAR JABATAN</td><td class="kv-sep">:</td><td class="custom-padding kv-right"></td></tr>
    </table>
    <p class="custom-justify" style="width: 99%; margin: 0 0 0 6px">${data.ikhtisar_jabatan}</p>
  </div>

  <!-- 5. KUALIFIKASI JABATAN -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left">5. KUALIFIKASI JABATAN</td><td class="kv-sep">:</td><td class="custom-padding kv-right"></td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px; width:36%;">a. Pendidikan Formal</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.pendidikan_formal)}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px;">b. Pendidikan dan Pelatihan</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify"></td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">Diklat Penjenjangan</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.diklat_penjenjangan}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">Diklat Teknis</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.diklat_teknis)}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">Diklat Fungsional</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.diklat_fungsional)}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px; width:36%;">c. Pengalaman Kerja</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderNumberList(data.pengalaman_kerja)}</td></tr>
    </table>
  </div>

  <!-- 6. TUGAS POKOK -->
  <div class="section page-break landscape table-section">
    <p>6. TUGAS POKOK :</p>
    <table style="width: 99%" class="word-table">
      <thead>
        <tr>
          <th style="width:3%;">NO</th>
          <th style="width:45%">URAIAN TUGAS</th>
          <th style="width:15%">HASIL KERJA</th>
          <th>JUMLAH HASIL</th>
          <th>WAKTU PENYELESAIAN (JAM)</th>
          <th>WAKTU EFEKTIF</th>
          <th>KEBUTUHAN PEGAWAI</th>
        </tr>
      </thead>
      <tbody>
        ${(data.tugas_pokok || []).map((item: any, index: number) => `
          <tr>
            <td style="text-align:center">${index + 1}.</td>
            <td style="text-align: justify">${renderUraianTugasDanTahapan(item)}</td>
            <td>${renderTableList(item.hasil_kerja)}</td>
            <td class="center">${item.jumlah_hasil}</td>
            <td class="center">${item.waktu_penyelesaian_jam}</td>
            <td class="center">${item.waktu_efektif}</td>
            <td class="center">${item.kebutuhan_pegawai}</td>
          </tr>
        `).join("")}
        <tr>
          <td colspan="6" class="center">Jumlah Pegawai Yang Dibutuhkan</td>
          <td class="center">${totalKebutuhan.toFixed(4)}</td>
        </tr>
        <tr>
          <td colspan="6" class="center">Pembulatan</td>
          <td class="center">${Math.ceil(totalKebutuhan)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 7. HASIL KERJA -->
  <div class="section portrait table-section">
    <p>7. HASIL KERJA :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>HASIL KERJA</th><th style="width:25%;">SATUAN HASIL</th></tr></thead>
      <tbody>
        ${(data.hasil_kerja || []).map((item: any, index: number) => `
          <tr>
            <td class="center">${index + 1}.</td>
            <td>${renderTableList(item.hasil_kerja)}</td>
            <td>${renderTableList(item.satuan_hasil)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- 8. BAHAN KERJA -->
  <div class="section portrait table-section">
    <p>8. BAHAN KERJA :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>BAHAN KERJA</th><th style="width:45%;">PENGGUNAAN DALAM TUGAS</th></tr></thead>
      <tbody>
        ${(data.bahan_kerja || []).map((item: any, index: number) => `
          <tr>
            <td class="center">${index + 1}.</td>
            <td>${renderTableList(item.bahan_kerja)}</td>
            <td>${renderTableList(item.penggunaan_dalam_tugas)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
  
   <!-- 9. PERANGKAT KERJA -->
  <div class="section portrait table-section">
    <p>9. PERANGKAT KERJA :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead>
        <tr>
          <th style="width:5%;">NO</th>
          <th>PERANGKAT KERJA</th>
          <th>PENGGUNAAN UNTUK TUGAS</th>
        </tr>
      </thead>
      <tbody>
          ${data.perangkat_kerja
    .map(
        (item, index) => `
                <tr>
                  <td style="text-align: center">${index + 1}.</td>
                  <td>${renderTableList(item.perangkat_kerja)}</td>
                  <td>${renderTableList(item.penggunaan_untuk_tugas)}</td>
                </tr>
              `
    )
    .join("")}
      </tbody>
    </table>
  </div>

  <!-- 10. TANGGUNG JAWAB -->
  <div class="section portrait table-section">
    <p>10. TANGGUNG JAWAB :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>URAIAN</th></tr></thead>
      <tbody>
        ${(data.tanggung_jawab || []).map((item: any, index: number) => `
          <tr><td class="center">${index + 1}.</td><td>${renderTableList(item.uraian_tanggung_jawab)}</td></tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- 11. WEWENANG -->
  <div class="section portrait table-section">
    <p>11. WEWENANG :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>URAIAN</th></tr></thead>
      <tbody>
        ${(data.wewenang || []).map((item: any, index: number) => `
          <tr><td class="center">${index + 1}.</td><td>${renderTableList(item.uraian_wewenang)}</td></tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- 12. KORELASI JABATAN -->
  <div class="section portrait table-section">
    <p>12. KORELASI JABATAN :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>Jabatan</th><th>Unit Kerja/Instansi</th><th>Dalam Hal</th></tr></thead>
      <tbody>
        ${(data.korelasi_jabatan || []).map((item: any, index: number) => `
          <tr>
            <td class="center">${index + 1}.</td>
            <td>${renderTableList(item.jabatan_terkait)}</td>
            <td>${renderTableList(item.unit_kerja_instansi)}</td>
            <td>${renderBulletList(item.dalam_hal)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- 13. KONDISI LINGKUNGAN KERJA -->
  <div class="section portrait table-section">
    <p>13. KONDISI LINGKUNGAN KERJA :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>ASPEK</th><th>FAKTOR</th></tr></thead>
      <tbody>
        ${(data.kondisi_lingkungan_kerja || []).map((item: any, index: number) => `
          <tr><td class="center">${index + 1}.</td><td>${renderTableList(item.aspek)}</td><td>${renderTableList(item.faktor)}</td></tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- 14. RISIKO BAHAYA -->
  <div class="section portrait table-section">
    <p>14. RISIKO BAHAYA :</p>
    <table style="margin-left: 0; width: 99%" class="word-table">
      <thead><tr><th style="width:5%;">NO</th><th>NAMA RISIKO</th><th>PENYEBAB</th></tr></thead>
      <tbody>
        ${(data.risiko_bahaya || []).map((item: any, index: number) => `
          <tr><td class="center">${index + 1}.</td><td>${renderTableList(item.nama_risiko)}</td><td>${renderTableList(item.penyebab)}</td></tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- 15. SYARAT JABATAN -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left">15. SYARAT JABATAN</td><td class="kv-sep">:</td><td class="custom-padding kv-right"></td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px; width:36%;">a. Keterampilan Kerja</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${Array.isArray(data.syarat_jabatan?.keterampilan_kerja) ? data.syarat_jabatan.keterampilan_kerja.join(", ") : data.syarat_jabatan?.keterampilan_kerja ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px;">b. Bakat Kerja</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.syarat_jabatan?.bakat_kerja)}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px;">c. Temperamen Kerja</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.syarat_jabatan?.temperamen_kerja)}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px;">d. Minat Kerja</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.syarat_jabatan?.minat_kerja)}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px;">e. Upaya Fisik</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${Array.isArray(data.syarat_jabatan?.upaya_fisik) ? data.syarat_jabatan.upaya_fisik.join(", ") : data.syarat_jabatan?.upaya_fisik ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px;"><span style="padding-right:5px">f.</span> Kondisi Fisik</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify"></td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">1) Jenis Kelamin</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_jenkel ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">2) Umur</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_umur ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">3) Tinggi Badan</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_tb ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">4) Berat Badan</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_bb ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">5) Postur Badan</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_pb ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">6) Penampilan</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_tampilan ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:43px;">7) Keadaan Fisik</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${data.syarat_jabatan?.kondisi_fisik_keadaan ?? ""}</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:25px; width:36%;">g. Fungsi Pekerja</td><td class="custom-padding kv-sep">:</td><td class="custom-padding kv-right custom-justify">${renderList(data.syarat_jabatan?.fungsi_pekerja)}</td></tr>
    </table>
  </div>

  <!-- 16. PRESTASI YANG DIHARAPKAN -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left">16. PRESTASI YANG DIHARAPKAN :</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:30px; width:36%;">${data.prestasi_diharapkan}</td></tr>
    </table>
  </div>

  <!-- 17. KELAS JABATAN -->
  <div class="section portrait">
    <table class="key-value">
      <tr><td class="kv-left">17. KELAS JABATAN :</td></tr>
      <tr><td class="custom-padding kv-left" style="padding-left:30px; width:36%;">${data.kelas_jabatan}</td></tr>
    </table>
  </div>
</div>
</body>
</html>`;
}

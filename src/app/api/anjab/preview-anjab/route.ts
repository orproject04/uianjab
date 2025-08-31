import pool from "@/lib/db";
import puppeteer from "puppeteer";
import {NextRequest} from "next/server";

export async function GET(req: NextRequest) {

    const {searchParams} = new URL(req.url);
    const id = searchParams.get("id");
    const output = searchParams.get("output") || "json"; // default json

    if (!id) {
        return Response.json({error: "id Dokumen Harus Dikirim"}, {status: 400});
    }

    try {
        const result = await pool.query(
            `
                SELECT j.id_jabatan,
                       j.kode_jabatan,
                       j.nama_jabatan,
                       j.ikhtisar_jabatan,
                       j.kelas_jabatan,
                       j.prestasi_diharapkan,

                       u.jpt_utama,
                       u.jpt_madya,
                       u.jpt_pratama,
                       u.administrator,
                       u.pengawas,
                       u.pelaksana,
                       u.jabatan_fungsional,

                       k.pendidikan_formal,
                       k.diklat_penjenjangan,
                       k.diklat_teknis,
                       k.diklat_fungsional,
                       k.pengalaman_kerja,

                       COALESCE(h.hasil_kerja, '[]')                AS hasil_kerja,
                       COALESCE(b.bahan_kerja, '[]')                AS bahan_kerja,
                       COALESCE(p.perangkat_kerja, '[]')            AS perangkat_kerja,
                       COALESCE(t.tanggung_jawab, '[]')             AS tanggung_jawab,
                       COALESCE(w.wewenang, '[]')                   AS wewenang,
                       COALESCE(kj.korelasi_jabatan, '[]')          AS korelasi_jabatan,
                       COALESCE(klk.kondisi_lingkungan_kerja, '[]') AS kondisi_lingkungan_kerja,
                       COALESCE(rb.risiko_bahaya, '[]')             AS risiko_bahaya,
                       COALESCE(sj.syarat_jabatan, '{}'::json)      AS syarat_jabatan,

                       COALESCE(tp.tugas_pokok, '[]')               AS tugas_pokok

                FROM jabatan j
                         LEFT JOIN unit_kerja u ON j.id_jabatan = u.id_jabatan
                         LEFT JOIN kualifikasi_jabatan k ON j.id_jabatan = k.id_jabatan

                    -- hasil_kerja
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'hasil_kerja', h.hasil_kerja,
                                           'satuan_hasil', h.satuan_hasil
                                   )
                           ) AS hasil_kerja
                    FROM hasil_kerja h
                    WHERE h.id_jabatan = j.id_jabatan
                        ) h ON TRUE

                    -- bahan_kerja
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'bahan_kerja', b.bahan_kerja,
                                           'penggunaan_dalam_tugas', b.penggunaan_dalam_tugas
                                   )
                           ) AS bahan_kerja
                    FROM bahan_kerja b
                    WHERE b.id_jabatan = j.id_jabatan
                        ) b ON TRUE

                    -- perangkat_kerja
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'perangkat_kerja', p.perangkat_kerja,
                                           'penggunaan_untuk_tugas', p.penggunaan_untuk_tugas
                                   )
                           ) AS perangkat_kerja
                    FROM perangkat_kerja p
                    WHERE p.id_jabatan = j.id_jabatan
                        ) p ON TRUE

                    -- tanggung_jawab
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'uraian_tanggung_jawab', t.uraian_tanggung_jawab
                                   )
                           ) AS tanggung_jawab
                    FROM tanggung_jawab t
                    WHERE t.id_jabatan = j.id_jabatan
                        ) t ON TRUE

                    -- wewenang
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'uraian_wewenang', w.uraian_wewenang
                                   )
                           ) AS wewenang
                    FROM wewenang w
                    WHERE w.id_jabatan = j.id_jabatan
                        ) w ON TRUE

                    -- korelasi_jabatan
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'jabatan_terkait', kj.jabatan_terkait,
                                           'unit_kerja_instansi', kj.unit_kerja_instansi,
                                           'dalam_hal', kj.dalam_hal
                                   )
                           ) AS korelasi_jabatan
                    FROM korelasi_jabatan kj
                    WHERE kj.id_jabatan = j.id_jabatan
                        ) kj ON TRUE

                    -- kondisi_lingkungan_kerja 
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'aspek', k.aspek,
                                           'faktor', k.faktor
                                   )
                           ) AS kondisi_lingkungan_kerja
                    FROM kondisi_lingkungan_kerja k
                    WHERE k.id_jabatan = j.id_jabatan
                        ) klk ON TRUE

                    -- risiko_bahaya
                         LEFT JOIN LATERAL (
                    SELECT JSON_AGG(
                                   JSON_BUILD_OBJECT(
                                           'nama_risiko', r.nama_risiko,
                                           'penyebab', r.penyebab
                                   )
                           ) AS risiko_bahaya
                    FROM risiko_bahaya r
                    WHERE r.id_jabatan = j.id_jabatan
                        ) rb ON TRUE

                    -- syarat_jabatan
                         LEFT JOIN LATERAL (
                    SELECT JSON_BUILD_OBJECT(
                                   'keterampilan_kerja', s.keterampilan_kerja,
                                   'bakat_kerja', s.bakat_kerja,
                                   'temperamen_kerja', s.temperamen_kerja,
                                   'minat_kerja', s.minat_kerja,
                                   'upaya_fisik', s.upaya_fisik,
                                   'kondisi_fisik_jenkel', s.kondisi_fisik_jenkel,
                                   'kondisi_fisik_umur', s.kondisi_fisik_umur,
                                   'kondisi_fisik_tb', s.kondisi_fisik_tb,
                                   'kondisi_fisik_bb', s.kondisi_fisik_bb,
                                   'kondisi_fisik_pb', s.kondisi_fisik_pb,
                                   'kondisi_fisik_tampilan', s.kondisi_fisik_tampilan,
                                   'kondisi_fisik_keadaan', s.kondisi_fisik_keadaan,
                                   'fungsi_pekerja', s.fungsi_pekerja
                           ) AS syarat_jabatan
                    FROM syarat_jabatan s
                    WHERE s.id_jabatan = j.id_jabatan
                        ) sj ON TRUE

                    -- 5. TUGAS_POKOK + tahapan_uraian_tugas
                         LEFT JOIN LATERAL (
                    SELECT COALESCE(
                                   JSON_AGG(
                                           JSON_BUILD_OBJECT(
                                                   'id_tugas', tp.id_tugas,
                                                   'nomor_tugas', tp.nomor_tugas,
                                                   'uraian_tugas', tp.uraian_tugas,
                                                   'hasil_kerja', tp.hasil_kerja,
                                                   'jumlah_hasil', tp.jumlah_hasil,
                                                   'waktu_penyelesaian_jam', tp.waktu_penyelesaian_jam,
                                                   'waktu_efektif', tp.waktu_efektif,
                                                   'kebutuhan_pegawai', tp.kebutuhan_pegawai,
                                                   'tahapan', (SELECT COALESCE(
                                                                              JSON_AGG(
                                                                                      JSON_BUILD_OBJECT(
                                                                                              'id_tahapan',
                                                                                              tut.id_tahapan,
                                                                                              'tahapan', tut.tahapan
                                                                                      )
                                                                              ),
                                                                              '[]'
                                                                      )
                                                               FROM tahapan_uraian_tugas tut
                                                               WHERE tut.id_tugas = tp.id_tugas)
                                           ) ORDER BY tp.nomor_tugas
                                   ),
                                   '[]'
                           ) AS tugas_pokok
                    FROM tugas_pokok tp
                    WHERE tp.id_jabatan = j.id_jabatan
                        ) tp ON TRUE

                WHERE j.id_jabatan = $1
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return Response.json({error: "Data Tidak Ditemukan"}, {status: 404});
        }

        const data = result.rows[0];
        // 👉 Output JSON
        if (output === "json") {
            return Response.json(data, {status: 200});
        }

// === SPLIT: bagi data ke halaman ===
        function splitPerangkatKeHalaman(data, maxRowsPerPage = 50) {
            const pages = [];
            let currentPage = [];
            let rowCount = 0;

            data.forEach((item, index) => {
                const perangkatList = item.perangkat_kerja || [];
                const penggunaanList = item.penggunaan_untuk_tugas || [];
                const total = Math.max(1, perangkatList.length);

                let i = 0;
                while (i < total) {
                    const available = maxRowsPerPage - rowCount;

                    // 🔹 Kalau item tidak muat di slot tersisa → pindah ke halaman baru
                    if (total - i > available && rowCount > 0) {
                        pages.push({rows: currentPage, continued: true});
                        currentPage = [];
                        rowCount = 0;
                        continue; // ulangi while di halaman baru
                    }

                    // 🔹 Ambil baris yang muat
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

                    // 🔹 Kalau penuh persis, tutup halaman & reset
                    if (rowCount >= maxRowsPerPage) {
                        pages.push({rows: currentPage, continued: true});
                        currentPage = [];
                        rowCount = 0;
                    }
                }
            });

            // 🔹 Tambahkan halaman terakhir (jika ada isinya)
            if (currentPage.length > 0) {
                pages.push({rows: currentPage, continued: false});
            }

            return pages;
        }

        function renderTable(data, maxRowsPerPage = 50) {
            const pages = splitPerangkatKeHalaman(data, maxRowsPerPage);

            return pages.map((page, pageIdx) => {
                const countInPage = {};
                page.rows.forEach(r => {
                    countInPage[r.index] = (countInPage[r.index] || 0) + 1;
                });

                const emittedInPage = {};
                const tbody = page.rows.map(r => {
                    const firstInThisPage = !emittedInPage[r.index];
                    emittedInPage[r.index] = (emittedInPage[r.index] || 0) + 1;

                    let cells = "";

                    // === KOLOM NO ===
                    if (firstInThisPage) {
                        cells += `<td style="text-align:center" rowspan="${countInPage[r.index]}">${r.index + 1}.</td>`;
                    }

                    // === KOLOM PERANGKAT ===
                    cells += `<td>${r.perangkat || ""}</td>`;

                    // === KOLOM PENGGUNAAN ===
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
              <th >NO</th>
              <th >PERANGKAT KERJA</th>
              <th>PENGGUNAAN UNTUK TUGAS</th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
        `;
            }).join('');
        }

        const renderList = (arr) => {
            if (!arr || arr.length === 0) return "-";
            return `<ul style="margin:0; padding-left:0px; list-style-type: none;">${arr.map(item => `<li>${item}</li>`).join("")}</ul>`;
        };

        const renderNumberList = (arr) => {
            if (!arr || arr.length === 0) return "-";
            return `<ol style="margin:0; padding-left:15px;">${arr.map(item => `<li>${item}</li>`).join("")}</ol>`;
        };

        function renderBulletList(value: string | string[]): string {
            if (Array.isArray(value)) {
                return `
            <ul style="margin:0; padding-left:1.5em; list-style-type: disc;">
                ${value
                    .map(
                        (sub) => `
                    <li>${sub}</li>
                `
                    )
                    .join("")}
            </ul>
        `;
            }
            return value;
        }

        function renderTableList(value: string | string[]): string {
            if (Array.isArray(value) && value.length > 0) {
                if (value.length === 1) {
                    return value[0];
                }
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

        function renderUraianTugasDanTahapan(item) {
            const uraian = renderTableList(item.uraian_tugas);

            let tahapanHtml = "";
            if (item.tahapan && item.tahapan.length > 0) {
                tahapanHtml = `
            <br><p>Tahapan :</p>
            <ol style="margin:0; padding-left:1.5em; list-style-type: decimal;">
                ${item.tahapan
                    .map(t => `<li style="margin-bottom:2px;">${t.tahapan}</li>`)
                    .join("")}
        `;
            }

            return `${uraian}${tahapanHtml}`;
        }

        const totalKebutuhan = data.tugas_pokok.reduce(
            (sum, item) => sum + (parseFloat(String(item.kebutuhan_pegawai).replace(",", ".")) || 0),
            0
        );


        if (output === "pdf") {
            // language=HTML
            const htmlContent = `
                <!doctype html>
                <html>
                <head>
                    <meta charset="utf-8"/>
                    <title>${data.nama_jabatan}</title>
                    <style>
                        @page portrait {
                            size: A4 portrait;
                            margin: 2cm 2.5cm 2.38cm 2.3cm;
                        }

                        @page landscape {
                            size: A4 landscape;
                            margin: 1.2cm 1.2cm 1.2cm 1.2cm;
                        }

                        .section.landscape {
                            page: landscape;
                        }

                        .section.portrait {
                            page: portrait;
                        }

                        html,
                        body {
                            height: 100%;
                        }

                        body {
                            font-family: "Tahoma", Times, serif;
                            font-size: 11pt;
                            line-height: 1.35;
                            color: #000;
                            margin: 0;
                            -webkit-font-smoothing: antialiased;
                        }

                        /* Headings */
                        .doc-title {
                            text-align: center;
                            margin-bottom: 19px;
                        }

                        /* Biar judul tidak ditinggal sendirian */
                        .table-section p {
                            page-break-after: avoid;
                            margin: 0;
                            padding: 0;
                        }

                        /* Tabel tetap boleh pecah */
                        .table-section table {
                            margin: 0;
                            padding: 0;
                        }

                        .word-table {
                            page-break-inside: auto; /* tabel boleh pecah */
                        }

                        .word-table thead {
                            display: table-header-group; /* header ikut setiap halaman */
                        }

                        .word-table tr {
                            page-break-inside: avoid; /* baris tidak terbelah */
                        }

                        .section {
                            margin-top: 5px;
                            margin-bottom: 20px;
                        }

                        .section .title {
                            font-weight: bold;
                            display: block;
                            margin-bottom: 4px;
                        }

                        p {
                            margin: 4px 0;
                            text-align: justify;
                        }

                        /* Tables used as form (no outer border) */
                        .key-value {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 5px;
                        }

                        .key-value td {
                            vertical-align: top;
                            padding: 4px 6px;
                        }

                        .key-value td.custom-padding {
                            padding-top: 0;
                            padding-bottom: 0;
                        }

                        .kv-left {
                            width: 33%;
                        }

                        .kv-sep {
                            width: 7%;
                        }

                        .kv-right {
                            width: 60%;
                        }

                        /* Small table styles (with borders like Word) */
                        table.word-table {
                            page-break-inside: auto;
                            width: 100%;
                            border-collapse: collapse;
                            margin: 6px 0 30px 0;
                            table-layout: auto;
                            font-size: 11pt;
                        }

                        table.word-table th,
                        table.word-table td {
                            border: 1px solid #000;
                            padding: 6px;
                            vertical-align: top;
                            word-break: normal; /* fix */
                            white-space: normal; /* fix */
                        }

                        table.word-table th {
                            font-weight: normal;
                            vertical-align: middle;
                            text-align: center;
                            background: #C3C3C3;
                        }


                        /* Lists styling to mimic Word */
                        ol.alpha {
                            list-style-type: lower-alpha;
                            margin: 0 0 0 1.2em;
                            padding: 0;
                        }

                        ol.num {
                            list-style-type: decimal;
                            margin: 0 0 0 1.2em;
                            padding: 0;
                        }

                        ul.simple {
                            margin: 0 0 0 1.2em;
                            padding: 0;
                            list-style-type: disc;
                        }

                        /* smaller text for table footers */
                        .small {
                            font-size: 10pt;
                        }

                        /* page break helper */
                        .page-break {
                            page-break-before: always;
                        }

                        /* monospace-like alignment for "JUMLAH" cells */
                        .center {
                            text-align: center;
                        }

                        /* tight spacing for multi-column key rows */
                        .two-col {
                            display: flex;
                            gap: 12px;
                        }

                        .two-col > div {
                            flex: 1;
                        }

                        .custom-justify {
                            text-align: justify;
                        }

                        .custom-justify:after {
                            content: "";
                            width: 100%;
                        }

                    </style>
                </head>
                <body>
                <div class="doc">
                    <!-- 1. NAMA JABATAN -->
                    <div class="section portrait">
                        <div class="doc-title" style="padding-bottom: 20px">INFORMASI JABATAN</div>
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">1. NAMA JABATAN</td>
                                <td class="kv-sep">:</td>
                                <td class="kv-right">${data.nama_jabatan}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- 2. KODE JABATAN -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">2. KODE JABATAN</td>
                                <td class="kv-sep">:</td>
                                <td class="kv-right">${data.kode_jabatan}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- 3. UNIT KERJA -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left" style="padding-bottom: 5px">3. UNIT KERJA</td>
                                <td class="kv-sep" style="padding-bottom: 5px;">:</td>
                                <td class="kv-right" style="padding-bottom: 5px;"></td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">a. JPT Utama</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.jpt_utama}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">b. JPT Madya</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.jpt_madya}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">c. JPT Pratama</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.jpt_pratama}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">d. Administrator</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.administrator}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">e. Pengawas</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.pengawas}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">f. Pelaksana</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.pelaksana}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 35px">g. Jabatan Fungsional</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right">${data.jabatan_fungsional}</td>
                            </tr>
                        </table>
                    </div>

                    <!-- 4. IKHTISAR JABATAN -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">4. IKHTISAR JABATAN</td>
                                <td class="kv-sep">:</td>
                                <td class="custom-padding kv-right"></td>
                            </tr>
                        </table>
                        <p class="custom-justify" style="width: 99%; margin: 0 0 0 6px">${data.ikhtisar_jabatan}</p>
                    </div>

                    <!-- 5. KUALIFIKASI JABATAN -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">5. KUALIFIKASI JABATAN</td>
                                <td class="kv-sep">:</td>
                                <td class="custom-padding kv-right"></td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px; width: 36%;">a. Pendidikan
                                    Formal
                                </td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderList(data.pendidikan_formal)}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px;">b. Pendidikan dan
                                    Pelatihan
                                </td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify"></td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">Diklat Penjenjangan</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">${data.diklat_penjenjangan}</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">Diklat Teknis</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">${renderList(data.diklat_teknis)}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">Diklat Fungsional</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderList(data.diklat_fungsional)}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px; width: 36%;">c. Pengalaman
                                    Kerja
                                </td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderNumberList(data.pengalaman_kerja)}
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- 6. TUGAS POKOK -->
                    <div class="section page-break landscape table-section">
                        <p>6. TUGAS POKOK :</p>
                        <table style="width: 99%" class="word-table">
                            <thead>
                            <tr>
                                <th style="width: 3%;">NO</th>
                                <th style="width: 45%">URAIAN TUGAS</th>
                                <th style="width: 15%">HASIL KERJA</th>
                                <th>JUMLAH HASIL</th>
                                <th>WAKTU PENYELESAIAN (JAM)</th>
                                <th>WAKTU EFEKTIF</th>
                                <th>KEBUTUHAN PEGAWAI</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.tugas_pokok.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
                                  <td style="text-align: justify">${renderUraianTugasDanTahapan(item)}</td>
                                  <td>${renderTableList(item.hasil_kerja)}</td>
                                  <td style="text-align: center">${item.jumlah_hasil}</td>
                                  <td style="text-align: center">${item.waktu_penyelesaian_jam}</td>
                                  <td style="text-align: center">${item.waktu_efektif}</td>
                                  <td style="text-align: center">${item.kebutuhan_pegawai}</td>
                                </tr>
                              `).join("")}
                            <tr>
                                <td colspan="6" style="text-align: center">Jumlah Pegawai Yang Dibutuhkan</td>
                                <td style="text-align: center">${totalKebutuhan.toFixed(4)}</td>
                            </tr>
                            <tr>
                                <td colspan="6" style="text-align: center">Pembulatan</td>
                                <td style="text-align: center">${Math.ceil(totalKebutuhan)}</td>
                            </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- 7. HASIL KERJA -->
                    <div class="section portrait table-section">
                        <p>7. HASIL KERJA :</p>
                        <table style="margin-left: 0; width: 99%" class="word-table">
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>HASIL KERJA</th>
                                <th style="width:25%;">SATUAN HASIL</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.hasil_kerja.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
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
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>BAHAN KERJA</th>
                                <th style="width:45%;">PENGGUNAAN DALAM TUGAS</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.bahan_kerja.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
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
                        ${renderTable(data.perangkat_kerja, 1000)}
                    </div>

                    <!-- 10. TANGGUNG JAWAB -->
                    <div class="section portrait table-section">
                        <p>10. TANGGUNG JAWAB :</p>
                        <table style="margin-left: 0; width: 99%" class="word-table">
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>URAIAN</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.tanggung_jawab.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
                                  <td>${renderTableList(item.uraian_tanggung_jawab)}</td>
                                </tr>
                              `).join("")}
                            </tbody>
                        </table>
                    </div>

                    <!-- 11. WEWENANG -->
                    <div class="section portrait table-section">
                        <p>11. WEWENANG :</p>
                        <table style="margin-left: 0; width: 99%" class="word-table">
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>URAIAN</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.wewenang.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
                                  <td>${renderTableList(item.uraian_wewenang)}</td>
                                </tr>
                              `).join("")}
                            </tbody>
                        </table>
                    </div>

                    <!-- 12. KORELASI JABATAN -->
                    <div class="section portrait table-section">
                        <p>12. KORELASI JABATAN :</p>
                        <table style="margin-left: 0; width: 99%" class="word-table">
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>Jabatan</th>
                                <th>Unit Kerja/Instansi</th>
                                <th>Dalam Hal</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.korelasi_jabatan.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
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
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>ASPEK</th>
                                <th>FAKTOR</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.kondisi_lingkungan_kerja.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
                                  <td>${renderTableList(item.aspek)}</td>
                                  <td>${renderTableList(item.faktor)}</td>
                                </tr>
                              `).join("")}
                            </tbody>
                        </table>
                    </div>

                    <!-- 14. RISIKO BAHAYA -->
                    <div class="section portrait table-section">
                        <p>14. RISIKO BAHAYA :</p>
                        <table style="margin-left: 0; width: 99%" class="word-table">
                            <thead>
                            <tr>
                                <th style="width:5%;">NO</th>
                                <th>NAMA RISIKO</th>
                                <th>PENYEBAB</th>
                            </tr>
                            </thead>
                            <tbody>
                            ${data.risiko_bahaya.map((item, index) => `
                                <tr>
                                  <td style="text-align: center">${index + 1}.</td>
                                  <td>${renderTableList(item.nama_risiko)}</td>
                                  <td>${renderTableList(item.penyebab)}</td>
                                </tr>
                              `).join("")}
                            </tbody>
                        </table>
                    </div>

                    <!-- 15. SYARAT JABATAN -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">15. SYARAT JABATAN</td>
                                <td class="kv-sep">:</td>
                                <td class="custom-padding kv-right"></td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px; width: 36%;">a.
                                    Keterampilan Kerja
                                </td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${Array.isArray(data.syarat_jabatan.keterampilan_kerja)
                                            ? data.syarat_jabatan.keterampilan_kerja.join(", ")
                                            : data.syarat_jabatan.keterampilan_kerja}
                                </td>
                            </tr>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px;">b. Bakat Kerja</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderList(data.syarat_jabatan.bakat_kerja)}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px;">c. Temperamen Kerja</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderList(data.syarat_jabatan.temperamen_kerja)}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px;">d. Minat Kerja</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderList(data.syarat_jabatan.minat_kerja)}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px;">e. Upaya Fisik</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${Array.isArray(data.syarat_jabatan.upaya_fisik)
                                            ? data.syarat_jabatan.upaya_fisik.join(", ")
                                            : data.syarat_jabatan.upaya_fisik}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px;"><span
                                        style="padding-right: 5px">f.</span> Kondisi Fisik
                                </td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify"></td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">1) Jenis Kelamin</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_jenkel}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">2) Umur</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_umur}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">3) Tinggi Badan</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_tb}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">4) Berat Badan</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_bb}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">5) Postur Badan</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_pb}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">6) Penampilan</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_tampilan}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 43px;">7) Keadaan Fisik</td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${data.syarat_jabatan.kondisi_fisik_keadaan}
                                </td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 25px; width: 36%;">g. Fungsi
                                    Pekerja
                                </td>
                                <td class="custom-padding kv-sep">:</td>
                                <td class="custom-padding kv-right custom-justify">
                                    ${renderList(data.syarat_jabatan.fungsi_pekerja)}
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- 16. PRESTASI YANG DIHARAPKAN -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">16. PRESTASI YANG DIHARAPKAN :</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 30px; width: 36%;">
                                    ${data.prestasi_diharapkan}
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- 17. KELAS JABATAN -->
                    <div class="section portrait">
                        <table class="key-value">
                            <tr>
                                <td class="kv-left">17. KELAS JABATAN :</td>
                            </tr>
                            <tr>
                                <td class="custom-padding kv-left" style="padding-left: 30px; width: 36%;">
                                    ${data.kelas_jabatan}
                                </td>
                            </tr>
                        </table>
                    </div>
                </body>
                </html>
            `;

            console.log(htmlContent)


            // Generate PDF pakai Puppeteer
            const browser = await puppeteer.launch({headless: "new"});
            const page = await browser.newPage();
            await page.setContent(htmlContent, {waitUntil: "networkidle0"});

            const pdfBuffer = await page.pdf({format: "A4", printBackground: true});
            await browser.close();

            // Kirim langsung sebagai PDF

            return new Response(pdfBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `inline; filename="Anjab ${data.nama_jabatan}.pdf"`,
                    "Content-Length": pdfBuffer.length.toString(),
                    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            });
        }

        return Response.json(
            {error: `Format '${output}' tidak didukung. Gunakan 'json' atau 'pdf'.`},
            {status: 400}
        );

    } catch (error) {
        console.error(error);
        return Response.json({error: "General Error"}, {status: 500});
    }
}

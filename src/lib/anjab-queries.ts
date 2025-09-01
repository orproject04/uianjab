import pool from "@/lib/db";

export type AnjabRow = {
    id_jabatan: string;
    kode_jabatan: string | null;
    nama_jabatan: string;
    ikhtisar_jabatan: string | null;
    kelas_jabatan: string | null;
    prestasi_diharapkan: string | null;

    jpt_utama: string | null;
    jpt_madya: string | null;
    jpt_pratama: string | null;
    administrator: string | null;
    pengawas: string | null;
    pelaksana: string | null;
    jabatan_fungsional: string | null;

    pendidikan_formal: string[] | null;
    diklat_penjenjangan: string[] | string | null;
    diklat_teknis: string[] | null;
    diklat_fungsional: string[] | null;
    pengalaman_kerja: string[] | null;

    hasil_kerja: Array<{ hasil_kerja: string[]; satuan_hasil: string[] }> | [];
    bahan_kerja: Array<{ bahan_kerja: string[]; penggunaan_dalam_tugas: string[] }> | [];
    perangkat_kerja: Array<{ perangkat_kerja: string[]; penggunaan_untuk_tugas: string[] }> | [];
    tanggung_jawab: Array<{ uraian_tanggung_jawab: string[] }> | [];
    wewenang: Array<{ uraian_wewenang: string[] }> | [];
    korelasi_jabatan: Array<{ jabatan_terkait: string[]; unit_kerja_instansi: string[]; dalam_hal: string[] }> | [];
    kondisi_lingkungan_kerja: Array<{ aspek: string[]; faktor: string[] }> | [];
    risiko_bahaya: Array<{ nama_risiko: string[]; penyebab: string[] }> | [];
    syarat_jabatan: {
        keterampilan_kerja?: string[] | string;
        bakat_kerja?: string[];
        temperamen_kerja?: string[];
        minat_kerja?: string[];
        upaya_fisik?: string[] | string;
        kondisi_fisik_jenkel?: string | null;
        kondisi_fisik_umur?: string | null;
        kondisi_fisik_tb?: string | null;
        kondisi_fisik_bb?: string | null;
        kondisi_fisik_pb?: string | null;
        kondisi_fisik_tampilan?: string | null;
        kondisi_fisik_keadaan?: string | null;
        fungsi_pekerja?: string[];
    } | Record<string, never>;
    tugas_pokok: Array<{
        id_tugas: number;
        nomor_tugas: number;
        uraian_tugas: string[] | string;
        hasil_kerja: string[] | string;
        jumlah_hasil: number;
        waktu_penyelesaian_jam: number;
        waktu_efektif: number;
        kebutuhan_pegawai: string | number;
        tahapan: Array<{ id_tahapan: number; tahapan: string }>;
    }> | [];
};

const SELECT_ANJAB_BY_ID = `
    SELECT j.id_jabatan,
           j.kode_jabatan,
           j.nama_jabatan,
           j.ikhtisar_jabatan,
           j.kelas_jabatan,
           j.prestasi_diharapkan,
           u.jpt_utama, u.jpt_madya, u.jpt_pratama, u.administrator, u.pengawas, u.pelaksana, u.jabatan_fungsional,
           k.pendidikan_formal, k.diklat_penjenjangan, k.diklat_teknis, k.diklat_fungsional, k.pengalaman_kerja,

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

        -- hasil_kerja: buang kosong + urutan stabil (id_hasil)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'hasil_kerja',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(h.hasil_kerja) x WHERE btrim(x) <> ''), '{}'),
                               'satuan_hasil',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(h.satuan_hasil) x WHERE btrim(x) <> ''), '{}')
                       )
                           ORDER BY h.id_hasil
               ) AS hasil_kerja
        FROM hasil_kerja h
        WHERE h.id_jabatan = j.id_jabatan
            ) h ON TRUE

        -- bahan_kerja: buang kosong + urutan stabil (id_bahan)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'bahan_kerja',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(b.bahan_kerja) x WHERE btrim(x) <> ''), '{}'),
                               'penggunaan_dalam_tugas',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(b.penggunaan_dalam_tugas) x WHERE btrim(x) <> ''), '{}')
                       )
                           ORDER BY b.id_bahan
               ) AS bahan_kerja
        FROM bahan_kerja b
        WHERE b.id_jabatan = j.id_jabatan
            ) b ON TRUE

        -- perangkat_kerja: buang kosong + urutan stabil (id_perangkat)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'perangkat_kerja',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(p.perangkat_kerja) x WHERE btrim(x) <> ''), '{}'),
                               'penggunaan_untuk_tugas',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(p.penggunaan_untuk_tugas) x WHERE btrim(x) <> ''), '{}')
                       )
                           ORDER BY p.id_perangkat
               ) AS perangkat_kerja
        FROM perangkat_kerja p
        WHERE p.id_jabatan = j.id_jabatan
            ) p ON TRUE

        -- tanggung_jawab: urut stabil (id_tanggung_jawab)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('uraian_tanggung_jawab', t.uraian_tanggung_jawab)
                           ORDER BY t.id_tanggung_jawab
               ) AS tanggung_jawab
        FROM tanggung_jawab t
        WHERE t.id_jabatan = j.id_jabatan
            ) t ON TRUE

        -- wewenang: urut stabil (id_wewenang)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('uraian_wewenang', w.uraian_wewenang)
                           ORDER BY w.id_wewenang
               ) AS wewenang
        FROM wewenang w
        WHERE w.id_jabatan = j.id_jabatan
            ) w ON TRUE

        -- korelasi_jabatan: urut stabil (id_korelasi)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'jabatan_terkait',       kj.jabatan_terkait,
                               'unit_kerja_instansi',   kj.unit_kerja_instansi,
                               'dalam_hal',             COALESCE(kj.dalam_hal, '{}')
                       )
                           ORDER BY kj.id_korelasi
               ) AS korelasi_jabatan
        FROM korelasi_jabatan kj
        WHERE kj.id_jabatan = j.id_jabatan
            ) kj ON TRUE

        -- kondisi_lingkungan_kerja: urut stabil (id_kondisi)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('aspek', k.aspek, 'faktor', k.faktor)
                           ORDER BY k.id_kondisi
               ) AS kondisi_lingkungan_kerja
        FROM kondisi_lingkungan_kerja k
        WHERE k.id_jabatan = j.id_jabatan
            ) klk ON TRUE

        -- risiko_bahaya: urut stabil (id_risiko)
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('nama_risiko', r.nama_risiko, 'penyebab', r.penyebab)
                           ORDER BY r.id_risiko
               ) AS risiko_bahaya
        FROM risiko_bahaya r
        WHERE r.id_jabatan = j.id_jabatan
            ) rb ON TRUE

             LEFT JOIN LATERAL (
        SELECT JSON_BUILD_OBJECT(
                       'keterampilan_kerja',      s.keterampilan_kerja,
                       'bakat_kerja',             s.bakat_kerja,
                       'temperamen_kerja',        s.temperamen_kerja,
                       'minat_kerja',             s.minat_kerja,
                       'upaya_fisik',             s.upaya_fisik,
                       'kondisi_fisik_jenkel',    s.kondisi_fisik_jenkel,
                       'kondisi_fisik_umur',      s.kondisi_fisik_umur,
                       'kondisi_fisik_tb',        s.kondisi_fisik_tb,
                       'kondisi_fisik_bb',        s.kondisi_fisik_bb,
                       'kondisi_fisik_pb',        s.kondisi_fisik_pb,
                       'kondisi_fisik_tampilan',  s.kondisi_fisik_tampilan,
                       'kondisi_fisik_keadaan',   s.kondisi_fisik_keadaan,
                       'fungsi_pekerja',          s.fungsi_pekerja
               ) AS syarat_jabatan
        FROM syarat_jabatan s
        WHERE s.id_jabatan = j.id_jabatan
            ) sj ON TRUE

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
                                       'tahapan', (
                                           SELECT COALESCE(
                                                          JSON_AGG(
                                                                  JSON_BUILD_OBJECT('id_tahapan', tut.id_tahapan, 'tahapan', tut.tahapan)
                                                                      ORDER BY tut.id_tahapan
                                                          ),
                                                          '[]'
                                                  )
                                           FROM tahapan_uraian_tugas tut
                                           WHERE tut.id_tugas = tp.id_tugas
                                       )
                               )
                                   ORDER BY tp.nomor_tugas, tp.id_tugas
                       ),
                       '[]'
               ) AS tugas_pokok
        FROM tugas_pokok tp
        WHERE tp.id_jabatan = j.id_jabatan
            ) tp ON TRUE

    WHERE j.id_jabatan = $1
`;

export async function getAnjabById(id: string): Promise<AnjabRow | null> {
    const { rows } = await pool.query<AnjabRow>(SELECT_ANJAB_BY_ID, [id]);
    return rows[0] ?? null;
}

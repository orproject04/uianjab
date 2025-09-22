// src/lib/anjab/getAnjab.ts
import pool from "@/lib/db";

export type AnjabRow = {
    id: string; // j.id (UUID)
    kode_jabatan: string | null;
    nama_jabatan: string;
    ikhtisar_jabatan: string | null;
    kelas_jabatan: string | null;
    prestasi_diharapkan: string | null;

    slug: string | null;
    updated_at: string;

    // NEW
    jenis_jabatan: string | null;

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
    syarat_jabatan:
        | {
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
    }
        | Record<string, never>;
    tugas_pokok:
        | Array<{
        id_tugas: string; // UUID
        nomor_tugas: number | null;
        uraian_tugas: string[] | string | null;
        hasil_kerja: string[] | string | null;
        jumlah_hasil: number | null;
        waktu_penyelesaian_jam: number | null;
        waktu_efektif: number | null;
        kebutuhan_pegawai: string | number | null;
        detail_uraian_tugas:
            | Array<{
            id_tahapan: string;
            nomor_tahapan: number | null;
            tahapan: string;
            detail_tahapan: string[];
        }>
            | [];
    }>
        | [];
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELECT_ANJAB = (whereClause: string) => `
    SELECT j.id,
           j.kode_jabatan,
           j.nama_jabatan,
           j.ikhtisar_jabatan,
           j.kelas_jabatan,
           j.prestasi_diharapkan,
           j.slug,
           j.updated_at,

           -- NEW
           so.jenis_jabatan                             AS jenis_jabatan,

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
             LEFT JOIN peta_jabatan so ON so.id = j.peta_id
             LEFT JOIN unit_kerja u ON u.jabatan_id = j.id
             LEFT JOIN kualifikasi_jabatan k ON k.jabatan_id = j.id

        -- hasil_kerja
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'hasil_kerja',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(h.hasil_kerja) x WHERE btrim(x) <> ''), '{}'),
                               'satuan_hasil',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(h.satuan_hasil) x WHERE btrim(x) <> ''), '{}')
                       ) ORDER BY h.id
               ) AS hasil_kerja
        FROM hasil_kerja h
        WHERE h.jabatan_id = j.id
            ) h ON TRUE

        -- bahan_kerja
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'bahan_kerja',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(b.bahan_kerja) x WHERE btrim(x) <> ''), '{}'),
                               'penggunaan_dalam_tugas',
                               COALESCE((SELECT ARRAY_AGG(x)
                                         FROM UNNEST(b.penggunaan_dalam_tugas) x
                                         WHERE btrim(x) <> ''), '{}')
                       ) ORDER BY b.id
               ) AS bahan_kerja
        FROM bahan_kerja b
        WHERE b.jabatan_id = j.id
            ) b ON TRUE

        -- perangkat_kerja
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'perangkat_kerja',
                               COALESCE((SELECT ARRAY_AGG(x) FROM UNNEST(p.perangkat_kerja) x WHERE btrim(x) <> ''),
                                        '{}'),
                               'penggunaan_untuk_tugas',
                               COALESCE((SELECT ARRAY_AGG(x)
                                         FROM UNNEST(p.penggunaan_untuk_tugas) x
                                         WHERE btrim(x) <> ''), '{}')
                       ) ORDER BY p.id
               ) AS perangkat_kerja
        FROM perangkat_kerja p
        WHERE p.jabatan_id = j.id
            ) p ON TRUE

        -- tanggung_jawab
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('uraian_tanggung_jawab', t.uraian_tanggung_jawab) ORDER BY t.id
               ) AS tanggung_jawab
        FROM tanggung_jawab t
        WHERE t.jabatan_id = j.id
            ) t ON TRUE

        -- wewenang
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('uraian_wewenang', w.uraian_wewenang) ORDER BY w.id
               ) AS wewenang
        FROM wewenang w
        WHERE w.jabatan_id = j.id
            ) w ON TRUE

        -- korelasi_jabatan
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT(
                               'jabatan_terkait', kj.jabatan_terkait,
                               'unit_kerja_instansi', kj.unit_kerja_instansi,
                               'dalam_hal', COALESCE(kj.dalam_hal, '{}')
                       ) ORDER BY kj.id
               ) AS korelasi_jabatan
        FROM korelasi_jabatan kj
        WHERE kj.jabatan_id = j.id
            ) kj ON TRUE

        -- kondisi_lingkungan_kerja
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('aspek', k.aspek, 'faktor', k.faktor) ORDER BY k.id
               ) AS kondisi_lingkungan_kerja
        FROM kondisi_lingkungan_kerja k
        WHERE k.jabatan_id = j.id
            ) klk ON TRUE

        -- risiko_bahaya
             LEFT JOIN LATERAL (
        SELECT JSON_AGG(
                       JSON_BUILD_OBJECT('nama_risiko', r.nama_risiko, 'penyebab', r.penyebab) ORDER BY r.id
               ) AS risiko_bahaya
        FROM risiko_bahaya r
        WHERE r.jabatan_id = j.id
            ) rb ON TRUE

        -- syarat_jabatan (single row → object)
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
        WHERE s.jabatan_id = j.id
            ) sj ON TRUE

        -- tugas_pokok + detail_uraian_tugas (tahapan + detail)
             LEFT JOIN LATERAL (
        SELECT COALESCE(
                       JSON_AGG(
                               JSON_BUILD_OBJECT(
                                       'id_tugas', tp.id,
                                       'nomor_tugas', tp.nomor_tugas,
                                       'uraian_tugas', tp.uraian_tugas,
                                       'hasil_kerja', tp.hasil_kerja,
                                       'jumlah_hasil', tp.jumlah_hasil,
                                       'waktu_penyelesaian_jam', tp.waktu_penyelesaian_jam,
                                       'waktu_efektif', tp.waktu_efektif,
                                       'kebutuhan_pegawai', tp.kebutuhan_pegawai,
                                       'detail_uraian_tugas',
                                       (SELECT COALESCE(
                                                       JSON_AGG(
                                                               JSON_BUILD_OBJECT(
                                                                       'id_tahapan', tut.id,
                                                                       'nomor_tahapan', tut.nomor_tahapan,
                                                                       'tahapan', tut.tahapan,
                                                                       'detail_tahapan',
                                                                       COALESCE(
                                                                               (SELECT ARRAY_AGG(d.detail ORDER BY d.id)
                                                                                FROM detail_tahapan_uraian_tugas d
                                                                                WHERE d.tahapan_id = tut.id), '{}')
                                                               ) ORDER BY COALESCE(tut.nomor_tahapan, 2147483647),
                                                               tut.id
                                                       ),
                                                       '[]'
                                               )
                                        FROM tahapan_uraian_tugas tut
                                        WHERE tut.tugas_id = tp.id)
                               ) ORDER BY COALESCE (tp.nomor_tugas, 2147483647), tp.id
                       ),
                       '[]'
               ) AS tugas_pokok
        FROM tugas_pokok tp
        WHERE tp.jabatan_id = j.id
            ) tp ON TRUE

    WHERE ${whereClause} LIMIT 1
`;

export async function getAnjabByIdOrSlug(idOrSlug: string): Promise<AnjabRow | null> {
    const isUuid = UUID_RE.test(idOrSlug);

    // Kalau UUID → coba id & peta_id
    if (isUuid) {
        const byId = await pool.query<AnjabRow>(SELECT_ANJAB("j.id = $1::uuid"), [idOrSlug]);
        if (byId.rows[0]) return byId.rows[0];

        const byPeta = await pool.query<AnjabRow>(SELECT_ANJAB("j.peta_id = $1::uuid"), [idOrSlug]);
        return byPeta.rows[0] ?? null;
    }

    // Selain itu → anggap slug
    const q = SELECT_ANJAB("j.slug = $1");
    const {rows} = await pool.query<AnjabRow>(q, [idOrSlug]);
    return rows[0] ?? null;
}

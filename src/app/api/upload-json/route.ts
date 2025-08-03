import {NextRequest, NextResponse} from 'next/server';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get('content-type');

        if (contentType?.includes('application/json')) {
            const body = await req.json();
            const items = Array.isArray(body) ? body : [body];

            if (!items.length) {
                return NextResponse.json({message: 'Data kosong atau tidak valid'}, {status: 400});
            }

            const client = await pool.connect();
            const results: any[] = [];

            try {
                await client.query('BEGIN');

                for (const item of items) {
                    console.log(item);
                    const {
                        nama_jabatan,
                        kode_jabatan,
                        ikhtisar_jabatan,
                        kelas_jabatan,
                        prestasi_yang_diharapkan,
                        unit_kerja = {},
                        kualifikasi_jabatan = {},
                        tugas_pokok = []
                    } = item;

                    if (!nama_jabatan || !kode_jabatan) {
                        results.push({
                            status: 'skipped',
                            reason: 'Nama atau kode jabatan kosong',
                            nama_jabatan,
                            kode_jabatan,
                        });
                        continue;
                    }

                    const truncatedNama = nama_jabatan.substring(0, 10).replace(/\s+/g, '_').toLowerCase();
                    const id_jabatan = `${truncatedNama}_${Date.now()}`;

                    // Insert into jabatan
                    await client.query(
                        `INSERT INTO jabatan
                         (id_jabatan, nama_jabatan, kode_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan,
                          created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                        [
                            id_jabatan,
                            nama_jabatan,
                            kode_jabatan,
                            ikhtisar_jabatan || '',
                            kelas_jabatan || '',
                            prestasi_yang_diharapkan || '',
                        ]
                    );

                    // Insert into unit_kerja
                    await client.query(
                        `INSERT INTO unit_kerja (id_jabatan,
                                                 jpt_utama,
                                                 jpt_madya,
                                                 jpt_pratama,
                                                 administrator,
                                                 pengawas,
                                                 pelaksana,
                                                 jabatan_fungsional,
                                                 created_at,
                                                 updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                        [
                            id_jabatan,
                            unit_kerja["JPT Utama"] || '',
                            unit_kerja["JPT Madya"] || '',
                            unit_kerja["JPT Pratama"] || '',
                            unit_kerja["Administrator"] || '',
                            unit_kerja["Pengawas"] || '',
                            unit_kerja["Pelaksana"] || '',
                            unit_kerja["Jabatan Fungsional"] || ''
                        ]
                    );

                    // Insert into kualifikasi_jabatan
                    const {
                        pendidikan_formal = '',
                        pendidikan_dan_pelatihan = {},
                        pengalaman_kerja = []
                    } = kualifikasi_jabatan;

                    const {
                        diklat_penjenjangan = [],
                        diklat_teknis = [],
                        diklat_fungsional = []
                    } = pendidikan_dan_pelatihan;

                    await client.query(
                        `INSERT INTO kualifikasi_jabatan (id_jabatan,
                                                          pendidikan_formal,
                                                          diklat_penjenjangan,
                                                          diklat_teknis,
                                                          diklat_fungsional,
                                                          pengalaman_kerja,
                                                          created_at,
                                                          updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                        [
                            id_jabatan,
                            pendidikan_formal,
                            diklat_penjenjangan,
                            diklat_teknis,
                            diklat_fungsional,
                            pengalaman_kerja
                        ]
                    );

                    // Insert into tugas_pokok dan tahapan_uraian_tugas
                    for (const tugas of tugas_pokok) {
                        const nomor_tugas = parseInt(tugas.no) || null;
                        const uraian = tugas.uraian_tugas?.deskripsi || '';
                        const tahapan = tugas.uraian_tugas?.tahapan || [];
                        const hasil_kerja = tugas.hasil_kerja || [];

                        const jumlah_hasil = tugas.jumlah_hasil ? parseInt(tugas.jumlah_hasil) : null;
                        const waktu_penyelesaian_jam = tugas['waktu_penyelesaian_(jam)'] ? parseInt(tugas['waktu_penyelesaian_(jam)']) : null;
                        const waktu_efektif = tugas.waktu_efektif ? parseInt(tugas.waktu_efektif) : null;
                        const kebutuhan_pegawai = tugas.kebutuhan_pegawai ? parseInt(tugas.kebutuhan_pegawai) : null;

                        const resTugas = await client.query(
                            `INSERT INTO tugas_pokok (id_jabatan,
                                                      nomor_tugas,
                                                      uraian_tugas,
                                                      hasil_kerja,
                                                      jumlah_hasil,
                                                      waktu_penyelesaian_jam,
                                                      waktu_efektif,
                                                      kebutuhan_pegawai,
                                                      created_at,
                                                      updated_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id_tugas`,
                            [
                                id_jabatan,
                                nomor_tugas,
                                uraian,
                                hasil_kerja,
                                jumlah_hasil,
                                waktu_penyelesaian_jam,
                                waktu_efektif,
                                kebutuhan_pegawai
                            ]
                        );

                        const id_tugas = resTugas.rows[0].id_tugas;

                        for (const tahap of tahapan) {
                            await client.query(
                                `INSERT INTO tahapan_uraian_tugas (id_tugas,
                                                                   id_jabatan,
                                                                   tahapan,
                                                                   created_at,
                                                                   updated_at)
                                 VALUES ($1, $2, $3, NOW(), NOW())`,
                                [id_tugas, id_jabatan, tahap]
                            );
                        }
                    }

                    // Insert into hasil_kerja
                    const hasilKerjaList = item.hasil_kerja || [];
                    for (const hasil of hasilKerjaList) {
                        const hasil_kerja_arr = Array.isArray(hasil.hasil_kerja) ? hasil.hasil_kerja : [];
                        const satuan_hasil_arr = Array.isArray(hasil.satuan_hasil) ? hasil.satuan_hasil : [];

                        await client.query(
                            `INSERT INTO hasil_kerja (id_jabatan,
                                                      hasil_kerja,
                                                      satuan_hasil,
                                                      created_at,
                                                      updated_at)
                             VALUES ($1, $2, $3, NOW(), NOW())`,
                            [
                                id_jabatan,
                                hasil_kerja_arr,
                                satuan_hasil_arr
                            ]
                        );
                    }

                    // Insert into bahan_kerja (dengan kolom TEXT[])
                    const bahanKerjaList = item.bahan_kerja || [];
                    for (const bahan of bahanKerjaList) {
                        await client.query(
                            `INSERT INTO bahan_kerja (id_jabatan,
                                                      bahan_kerja,
                                                      penggunaan_dalam_tugas,
                                                      created_at,
                                                      updated_at)
                             VALUES ($1, $2, $3, NOW(), NOW())`,
                            [
                                id_jabatan,
                                bahan.bahan_kerja || [],
                                bahan.penggunaan_dalam_tugas || []
                            ]
                        );
                    }

                    // Insert into perangkat_kerja (dengan kolom TEXT[])
                    const perangkatKerjaList = item.perangkat_kerja || [];
                    for (const perangkat of perangkatKerjaList) {
                        await client.query(
                            `INSERT INTO perangkat_kerja (id_jabatan,
                                                          perangkat_kerja,
                                                          penggunaan_untuk_tugas,
                                                          created_at,
                                                          updated_at)
                             VALUES ($1, $2, $3, NOW(), NOW())`,
                            [
                                id_jabatan,
                                perangkat.perangkat_kerja || [],
                                perangkat.penggunaan_untuk_tugas || []
                            ]
                        );
                    }

                    // Insert into tanggung_jawab
                    const tanggungJawabList = item.tanggung_jawab || [];
                    for (const tj of tanggungJawabList) {
                        await client.query(
                            `INSERT INTO tanggung_jawab (id_jabatan,
                                                         uraian_tanggung_jawab,
                                                         created_at,
                                                         updated_at)
                             VALUES ($1, $2, NOW(), NOW())`,
                            [
                                id_jabatan,
                                tj.uraian || ''
                            ]
                        );
                    }

                    // Insert into wewenang
                    const wewenangList = item.wewenang || [];
                    for (const w of wewenangList) {
                        await client.query(
                            `INSERT INTO wewenang (id_jabatan,
                                                   uraian_wewenang,
                                                   created_at,
                                                   updated_at)
                             VALUES ($1, $2, NOW(), NOW())`,
                            [
                                id_jabatan,
                                w.uraian || ''
                            ]
                        );
                    }

                    // Insert into korelasi_jabatan
                    const korelasiList = item.korelasi_jabatan || [];
                    for (const k of korelasiList) {
                        await client.query(
                            `INSERT INTO korelasi_jabatan (id_jabatan,
                                                           jabatan_terkait,
                                                           unit_kerja_instansi,
                                                           dalam_hal,
                                                           created_at,
                                                           updated_at)
                             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
                            [
                                id_jabatan,
                                k.jabatan || '',
                                k.unit_kerja_instansi || '',
                                k.dalam_hal || []
                            ]
                        );
                    }

                    // Insert into kondisi_lingkungan_kerja
                    const kondisiList = item.kondisi_lingkungan_kerja || [];
                    for (const kondisi of kondisiList) {
                        await client.query(
                            `INSERT INTO kondisi_lingkungan_kerja (id_jabatan,
                                                                   aspek,
                                                                   faktor,
                                                                   created_at,
                                                                   updated_at)
                             VALUES ($1, $2, $3, NOW(), NOW())`,
                            [
                                id_jabatan,
                                kondisi.aspek || '',
                                kondisi.faktor || ''
                            ]
                        );
                    }

                    // Insert into risiko_bahaya
                    const risikoList = item.risiko_bahaya || [];
                    for (const risiko of risikoList) {
                        await client.query(
                            `INSERT INTO risiko_bahaya (id_jabatan,
                                                        nama_risiko,
                                                        penyebab,
                                                        created_at,
                                                        updated_at)
                             VALUES ($1, $2, $3, NOW(), NOW())`,
                            [
                                id_jabatan,
                                risiko.nama_risiko || '',
                                risiko.penyebab || ''
                            ]
                        );
                    }

                    // Insert into syarat_jabatan
                    const syarat = item.syarat_jabatan || {};

                    await client.query(
                        `INSERT INTO syarat_jabatan (id_jabatan,
                                                     keterampilan_kerja,
                                                     bakat_kerja,
                                                     temperamen_kerja,
                                                     minat_kerja,
                                                     upaya_fisik,
                                                     kondisi_fisik_jenkel,
                                                     kondisi_fisik_umur,
                                                     kondisi_fisik_tb,
                                                     kondisi_fisik_bb,
                                                     kondisi_fisik_pb,
                                                     kondisi_fisik_tampilan,
                                                     kondisi_fisik_keadaan,
                                                     fungsi_pekerja,
                                                     created_at,
                                                     updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6,
                                 $7, $8, $9, $10, $11, $12, $13, $14,
                                 NOW(), NOW())`,
                        [
                            id_jabatan,
                            syarat.keterampilan_kerja || [],
                            syarat.bakat_kerja || [],
                            syarat.temperamen_kerja || [],
                            syarat.minat_kerja || [],
                            syarat.upaya_fisik || [],
                            syarat.kondisi_fisik?.jenis_kelamin || '',
                            syarat.kondisi_fisik?.umur || '',
                            syarat.kondisi_fisik?.tinggi_badan || '',
                            syarat.kondisi_fisik?.berat_badan || '',
                            syarat.kondisi_fisik?.postur_badan || '',
                            syarat.kondisi_fisik?.penampilan || '',
                            syarat.kondisi_fisik?.keadaan_fisik || '',
                            syarat.fungsi_pekerja || []
                        ]
                    );

                    results.push({status: 'success', id_jabatan, nama_jabatan});
                }

                await client.query('COMMIT');

                return NextResponse.json({
                    message: 'Selesai menyimpan data',
                    jumlah: results.length,
                    results,
                }, {status: 200});

            } catch (err) {
                await client.query('ROLLBACK');
                console.error('❌ Rollback karena error:', err);
                return NextResponse.json({message: 'Gagal menyimpan data', error: String(err)}, {status: 500});
            } finally {
                client.release();
            }
        } else {
            return NextResponse.json({message: 'Unsupported Content-Type'}, {status: 415});
        }

    } catch (err) {
        console.error('❌ Gagal parsing request:', err);
        return NextResponse.json({message: 'Internal server error', error: String(err)}, {status: 500});
    }
}

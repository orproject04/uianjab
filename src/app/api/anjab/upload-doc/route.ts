import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import path from 'path';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];
        const id_jabatan = formData.get("id_jabatan") as string | null;

        if (!id_jabatan) {
            return NextResponse.json({ message: "id_jabatan wajib dikirim" }, { status: 400 });
        }

        if (!files.length) {
            return NextResponse.json({ message: 'Tidak ada file yang dikirim' }, { status: 400 });
        }

        const results: any[] = [];
        const scriptPath = path.resolve(process.cwd(), 'scripts', 'ekstrakanjab.py');
        const tempFolder = path.resolve(process.cwd(), 'scripts', 'tmp');
        await fs.mkdir(tempFolder, { recursive: true });

        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const tempDocPath = path.join(tempFolder, file.name);
            await fs.writeFile(tempDocPath, buffer);

            let stdoutData = '';
            let stderrData = '';

            const exitCode: number = await new Promise((resolve, reject) => {
                const python = spawn('python', [scriptPath, tempDocPath]);
                python.stdout.on('data', (data) => stdoutData += data.toString());
                python.stderr.on('data', (data) => stderrData += data.toString());
                python.on('close', resolve);
                python.on('error', reject);
            });

            await fs.unlink(tempDocPath);

            if (exitCode !== 0 || !stdoutData) {
                console.error(`❌ Gagal ekstrak ${file.name}:`, stderrData);
                results.push({ file: file.name, status: 'extract_failed', error: stderrData });
                continue;
            }

            try {
                const item = JSON.parse(stdoutData);

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
                    console.warn(`⚠️ Data tidak lengkap untuk file: ${file.name}`);
                    results.push({ file: file.name, status: 'missing_data' });
                    continue;
                }

                // const truncatedNama = nama_jabatan.substring(0, 10).replace(/\s+/g, '_').toLowerCase();
                // const id_jabatan = `${truncatedNama}_${Date.now()}`;
                const client = await pool.connect();

                try {
                    await client.query('BEGIN');

                    // ------------------ jabatan ------------------
                    await client.query(
                        `INSERT INTO jabatan
                         (id_jabatan, nama_jabatan, kode_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, created_at, updated_at)
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

                    // ------------------ unit_kerja ------------------
                    await client.query(
                        `INSERT INTO unit_kerja (id_jabatan,
                                                 jpt_utama, jpt_madya, jpt_pratama, administrator, pengawas, pelaksana, jabatan_fungsional,
                                                 created_at, updated_at)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
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

                    // ------------------ kualifikasi_jabatan ------------------
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
                                                          pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja,
                                                          created_at, updated_at)
                         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
                        [
                            id_jabatan,
                            pendidikan_formal,
                            diklat_penjenjangan,
                            diklat_teknis,
                            diklat_fungsional,
                            pengalaman_kerja
                        ]
                    );

                    // ------------------ tugas_pokok & tahapan ------------------
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
                                                      nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                                                      waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai,
                                                      created_at, updated_at)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING id_tugas`,
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
                                `INSERT INTO tahapan_uraian_tugas (id_tugas, id_jabatan, tahapan, created_at, updated_at)
                                 VALUES ($1,$2,$3,NOW(),NOW())`,
                                [id_tugas, id_jabatan, tahap]
                            );
                        }
                    }

                    // ------------------ hasil_kerja ------------------
                    const hasilKerjaList = item.hasil_kerja || [];
                    for (const hasil of hasilKerjaList) {
                        const hasil_kerja_arr = Array.isArray(hasil.hasil_kerja) ? hasil.hasil_kerja : [];
                        const satuan_hasil_arr = Array.isArray(hasil.satuan_hasil) ? hasil.satuan_hasil : [];
                        await client.query(
                            `INSERT INTO hasil_kerja (id_jabatan, hasil_kerja, satuan_hasil, created_at, updated_at)
                             VALUES ($1,$2,$3,NOW(),NOW())`,
                            [id_jabatan, hasil_kerja_arr, satuan_hasil_arr]
                        );
                    }

                    // ------------------ bahan_kerja ------------------
                    const bahanKerjaList = item.bahan_kerja || [];
                    for (const bahan of bahanKerjaList) {
                        await client.query(
                            `INSERT INTO bahan_kerja (id_jabatan, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at)
                             VALUES ($1,$2,$3,NOW(),NOW())`,
                            [id_jabatan, bahan.bahan_kerja || [], bahan.penggunaan_dalam_tugas || []]
                        );
                    }

                    // ------------------ perangkat_kerja ------------------
                    const perangkatKerjaList = item.perangkat_kerja || [];
                    for (const perangkat of perangkatKerjaList) {
                        await client.query(
                            `INSERT INTO perangkat_kerja (id_jabatan, perangkat_kerja, penggunaan_untuk_tugas, created_at, updated_at)
                             VALUES ($1,$2,$3,NOW(),NOW())`,
                            [id_jabatan, perangkat.perangkat_kerja || [], perangkat.penggunaan_untuk_tugas || []]
                        );
                    }

                    // ------------------ tanggung_jawab ------------------
                    const tanggungJawabList = item.tanggung_jawab || [];
                    for (const tj of tanggungJawabList) {
                        await client.query(
                            `INSERT INTO tanggung_jawab (id_jabatan, uraian_tanggung_jawab, created_at, updated_at)
                             VALUES ($1,$2,NOW(),NOW())`,
                            [id_jabatan, tj.uraian || '']
                        );
                    }

                    // ------------------ wewenang ------------------
                    const wewenangList = item.wewenang || [];
                    for (const w of wewenangList) {
                        await client.query(
                            `INSERT INTO wewenang (id_jabatan, uraian_wewenang, created_at, updated_at)
                             VALUES ($1,$2,NOW(),NOW())`,
                            [id_jabatan, w.uraian || '']
                        );
                    }

                    // ------------------ korelasi_jabatan ------------------
                    const korelasiList = item.korelasi_jabatan || [];
                    for (const k of korelasiList) {
                        await client.query(
                            `INSERT INTO korelasi_jabatan (id_jabatan, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at)
                             VALUES ($1,$2,$3,$4,NOW(),NOW())`,
                            [id_jabatan, k.jabatan || '', k.unit_kerja_instansi || '', k.dalam_hal || []]
                        );
                    }

                    // ------------------ kondisi_lingkungan_kerja ------------------
                    const kondisiList = item.kondisi_lingkungan_kerja || [];
                    for (const kondisi of kondisiList) {
                        await client.query(
                            `INSERT INTO kondisi_lingkungan_kerja (id_jabatan, aspek, faktor, created_at, updated_at)
                             VALUES ($1,$2,$3,NOW(),NOW())`,
                            [id_jabatan, kondisi.aspek || '', kondisi.faktor || '']
                        );
                    }

                    // ------------------ risiko_bahaya ------------------
                    const risikoList = item.risiko_bahaya || [];
                    for (const risiko of risikoList) {
                        await client.query(
                            `INSERT INTO risiko_bahaya (id_jabatan, nama_risiko, penyebab, created_at, updated_at)
                             VALUES ($1,$2,$3,NOW(),NOW())`,
                            [id_jabatan, risiko.nama_risiko || '', risiko.penyebab || '']
                        );
                    }

                    // ------------------ syarat_jabatan ------------------
                    const syarat = item.syarat_jabatan || {};
                    await client.query(
                        `INSERT INTO syarat_jabatan (id_jabatan, keterampilan_kerja, bakat_kerja, temperamen_kerja, minat_kerja, upaya_fisik,
                                                     kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb, kondisi_fisik_bb,
                                                     kondisi_fisik_pb, kondisi_fisik_tampilan, kondisi_fisik_keadaan, fungsi_pekerja,
                                                     created_at, updated_at)
                         VALUES ($1,$2,$3,$4,$5,$6,
                                 $7,$8,$9,$10,$11,$12,$13,$14,
                                 NOW(),NOW())`,
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

                    await client.query('COMMIT');
                    results.push({ file: file.name, status: 'success', id_jabatan });

                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Error insert data untuk ${file.name}:`, err);
                    results.push({ file: file.name, status: 'failed', error: String(err) });
                } finally {
                    client.release();
                }

            } catch (jsonError) {
                console.error(`❌ JSON tidak valid dari ${file.name}:`, jsonError);
                results.push({ file: file.name, status: 'invalid_json' });
            }
        }

        return NextResponse.json({
            message: `Proses selesai (${results.filter(r => r.status === 'success').length} sukses)`,
            detail: results,
        });

    } catch (err) {
        console.error('❌ Upload error:', err);
        return NextResponse.json({ message: 'Server error', error: String(err) }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import pool from '@/lib/db';
import {getUserFromReq, hasRole} from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden"}, {status: 403});
        }
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];
        const id_jabatan = formData.get('id_jabatan') as string | null;

        if (!id_jabatan) {
            return NextResponse.json({ message: 'id_jabatan wajib dikirim' }, { status: 400 });
        }
        if (!files.length) {
            return NextResponse.json({ message: 'Tidak ada file yang dikirim' }, { status: 400 });
        }

        const results: any[] = [];
        const scriptPath = path.resolve(process.cwd(), 'scripts', 'ekstrakanjab.py');

        // 1) Buat temp dir unik per request
        const sessionTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anjab-'));

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // 2) Bangun nama file unik
                const ext = path.extname(file.name) || '.doc';
                const base = path.basename(file.name, ext).replace(/[^\w\-]+/g, '_');
                const unique = crypto.randomUUID();
                const tempDocPath = path.join(sessionTmpDir, `${base}-${unique}${ext}`);

                // 3) Tulis file (retry kecil)
                const buffer = Buffer.from(await file.arrayBuffer());
                await writeWithRetry(tempDocPath, buffer);

                let stdoutData = '';
                let stderrData = '';

                const exitCode: number = await new Promise((resolve, reject) => {
                    const python = spawn('python', [scriptPath, tempDocPath], { windowsHide: true });
                    python.stdout.on('data', (d) => (stdoutData += d.toString()));
                    python.stderr.on('data', (d) => (stderrData += d.toString()));
                    python.on('close', (code) => resolve(code ?? 1));
                    python.on('error', reject);
                });

                // 4) Hapus file tmp
                await safeUnlink(tempDocPath);

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
                        tugas_pokok = [],
                    } = item;

                    if (!nama_jabatan || !kode_jabatan) {
                        console.warn(`⚠️ Data tidak lengkap untuk file: ${file.name}`);
                        results.push({ file: file.name, status: 'missing_data' });
                        continue;
                    }

                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');

                        // === PERUBAHAN: tidak set kolom id; simpan id_jabatan ke kolom slug; ambil UUID via RETURNING id ===
                        const insJabatan = await client.query(
                            `INSERT INTO jabatan
               (kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan, slug, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
               RETURNING id`,
                            [
                                kode_jabatan,
                                nama_jabatan,
                                ikhtisar_jabatan || '',
                                kelas_jabatan || '',
                                prestasi_yang_diharapkan || '',
                                id_jabatan, // <- ditaruh di kolom slug
                            ],
                        );
                        const jabatanUUID: string = insJabatan.rows[0].id; // UUID auto-generate

                        await client.query(
                            `INSERT INTO unit_kerja (jabatan_id,
                                                     jpt_utama, jpt_madya, jpt_pratama, administrator, pengawas, pelaksana, jabatan_fungsional,
                                                     created_at, updated_at)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
                            [
                                jabatanUUID,
                                unit_kerja['JPT Utama'] || '',
                                unit_kerja['JPT Madya'] || '',
                                unit_kerja['JPT Pratama'] || '',
                                unit_kerja['Administrator'] || '',
                                unit_kerja['Pengawas'] || '',
                                unit_kerja['Pelaksana'] || '',
                                unit_kerja['Jabatan Fungsional'] || '',
                            ],
                        );

                        const {
                            pendidikan_formal = '',
                            pendidikan_dan_pelatihan = {},
                            pengalaman_kerja = [],
                        } = kualifikasi_jabatan;

                        const {
                            diklat_penjenjangan = [],
                            diklat_teknis = [],
                            diklat_fungsional = [],
                        } = pendidikan_dan_pelatihan;

                        const pendidikan_formal_arr = Array.isArray(pendidikan_formal)
                            ? pendidikan_formal
                            : (typeof pendidikan_formal === 'string' && pendidikan_formal.trim() !== '' ? [pendidikan_formal] : []);

                        await client.query(
                            `INSERT INTO kualifikasi_jabatan (jabatan_id,
                                                              pendidikan_formal, diklat_penjenjangan, diklat_teknis, diklat_fungsional, pengalaman_kerja,
                                                              created_at, updated_at)
                             VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
                            [
                                jabatanUUID,
                                pendidikan_formal_arr,
                                diklat_penjenjangan,
                                diklat_teknis,
                                diklat_fungsional,
                                Array.isArray(pengalaman_kerja) ? pengalaman_kerja : [],
                            ],
                        );

                        for (const tugas of tugas_pokok) {
                            const nomor_tugas = parseInt(tugas.no) || null;
                            const uraian = tugas.uraian_tugas?.deskripsi || '';
                            const tahapan = tugas.uraian_tugas?.tahapan || [];
                            const hasil_kerja = tugas.hasil_kerja || [];
                            const jumlah_hasil = tugas.jumlah_hasil ? parseInt(tugas.jumlah_hasil) : null;
                            const waktu_penyelesaian_jam = tugas['waktu_penyelesaian_(jam)']
                                ? parseInt(tugas['waktu_penyelesaian_(jam)'])
                                : null;
                            const waktu_efektif = tugas.waktu_efektif ? parseInt(tugas.waktu_efektif) : null;
                            const kebutuhan_pegawai = tugas.kebutuhan_pegawai ? parseInt(tugas.kebutuhan_pegawai) : null;

                            const resTugas = await client.query(
                                `INSERT INTO tugas_pokok (jabatan_id,
                                                          nomor_tugas, uraian_tugas, hasil_kerja, jumlah_hasil,
                                                          waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai,
                                                          created_at, updated_at)
                                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING id`,
                                [
                                    jabatanUUID,
                                    nomor_tugas,
                                    uraian,
                                    hasil_kerja,
                                    jumlah_hasil,
                                    waktu_penyelesaian_jam,
                                    waktu_efektif,
                                    kebutuhan_pegawai,
                                ],
                            );

                            const tugas_id = resTugas.rows[0].id;

                            for (const tahap of tahapan) {
                                await client.query(
                                    `INSERT INTO tahapan_uraian_tugas (tugas_id, jabatan_id, tahapan, created_at, updated_at)
                                     VALUES ($1,$2,$3,NOW(),NOW())`,
                                    [tugas_id, jabatanUUID, tahap],
                                );
                            }
                        }

                        const hasilKerjaList = item.hasil_kerja || [];
                        for (const hasil of hasilKerjaList) {
                            const hasil_kerja_arr = Array.isArray(hasil.hasil_kerja) ? hasil.hasil_kerja : [];
                            const satuan_hasil_arr = Array.isArray(hasil.satuan_hasil) ? hasil.satuan_hasil : [];
                            await client.query(
                                `INSERT INTO hasil_kerja (jabatan_id, hasil_kerja, satuan_hasil, created_at, updated_at)
                                 VALUES ($1,$2,$3,NOW(),NOW())`,
                                [jabatanUUID, hasil_kerja_arr, satuan_hasil_arr],
                            );
                        }

                        const bahanKerjaList = item.bahan_kerja || [];
                        for (const bahan of bahanKerjaList) {
                            await client.query(
                                `INSERT INTO bahan_kerja (jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at, updated_at)
                                 VALUES ($1,$2,$3,NOW(),NOW())`,
                                [jabatanUUID, bahan.bahan_kerja || [], bahan.penggunaan_dalam_tugas || []],
                            );
                        }

                        const perangkatKerjaList = item.perangkat_kerja || [];
                        for (const perangkat of perangkatKerjaList) {
                            await client.query(
                                `INSERT INTO perangkat_kerja (jabatan_id, perangkat_kerja, penggunaan_untuk_tugas, created_at, updated_at)
                                 VALUES ($1,$2,$3,NOW(),NOW())`,
                                [jabatanUUID, perangkat.perangkat_kerja || [], perangkat.penggunaan_untuk_tugas || []],
                            );
                        }

                        const tanggungJawabList = item.tanggung_jawab || [];
                        for (const tj of tanggungJawabList) {
                            await client.query(
                                `INSERT INTO tanggung_jawab (jabatan_id, uraian_tanggung_jawab, created_at, updated_at)
                                 VALUES ($1,$2,NOW(),NOW())`,
                                [jabatanUUID, tj.uraian || ''],
                            );
                        }

                        const wewenangList = item.wewenang || [];
                        for (const w of wewenangList) {
                            await client.query(
                                `INSERT INTO wewenang (jabatan_id, uraian_wewenang, created_at, updated_at)
                                 VALUES ($1,$2,NOW(),NOW())`,
                                [jabatanUUID, w.uraian || ''],
                            );
                        }

                        const korelasiList = item.korelasi_jabatan || [];
                        for (const k of korelasiList) {
                            await client.query(
                                `INSERT INTO korelasi_jabatan (jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal, created_at, updated_at)
                                 VALUES ($1,$2,$3,$4,NOW(),NOW())`,
                                [jabatanUUID, k.jabatan || '', k.unit_kerja_instansi || '', k.dalam_hal || []],
                            );
                        }

                        const kondisiList = item.kondisi_lingkungan_kerja || [];
                        for (const kondisi of kondisiList) {
                            await client.query(
                                `INSERT INTO kondisi_lingkungan_kerja (jabatan_id, aspek, faktor, created_at, updated_at)
                                 VALUES ($1,$2,$3,NOW(),NOW())`,
                                [jabatanUUID, kondisi.aspek || '', kondisi.faktor || ''],
                            );
                        }

                        const risikoList = item.risiko_bahaya || [];
                        for (const risiko of risikoList) {
                            await client.query(
                                `INSERT INTO risiko_bahaya (jabatan_id, nama_risiko, penyebab, created_at, updated_at)
                                 VALUES ($1,$2,$3,NOW(),NOW())`,
                                [jabatanUUID, risiko.nama_risiko || '', risiko.penyebab || ''],
                            );
                        }

                        const syarat = item.syarat_jabatan || {};
                        await client.query(
                            `INSERT INTO syarat_jabatan (jabatan_id, keterampilan_kerja, bakat_kerja, temperamen_kerja, minat_kerja, upaya_fisik,
                                                         kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb, kondisi_fisik_bb,
                                                         kondisi_fisik_pb, kondisi_fisik_tampilan, kondisi_fisik_keadaan, fungsi_pekerja,
                                                         created_at, updated_at)
                             VALUES ($1,$2,$3,$4,$5,$6,
                                     $7,$8,$9,$10,$11,$12,$13,$14,
                                     NOW(),NOW())`,
                            [
                                jabatanUUID,
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
                                syarat.fungsi_pekerja || [],
                            ],
                        );

                        await client.query('COMMIT');
                        results.push({ file: file.name, status: 'success', id_jabatan }); // tetap sama seperti sebelumnya
                    } catch (err) {
                        await client.query('ROLLBACK');
                        console.error(`❌ Error insert data untuk ${file.name}:`, err);
                        results.push({ file: file.name, status: 'failed', error: String(err) });
                    } finally {
                        client.release();
                    }
                } catch (jsonErr) {
                    console.error(`❌ JSON tidak valid dari ${file.name}:`, jsonErr);
                    results.push({ file: file.name, status: 'invalid_json' });
                }
            }

            return NextResponse.json({
                message: `Proses selesai (${results.filter((r) => r.status === 'success').length} sukses)`,
                detail: results,
            });
        } finally {
            // 5) Bersihkan folder session
            await fs.rm(sessionTmpDir, { recursive: true, force: true });
        }
    } catch (err) {
        console.error('❌ Upload error:', err);
        return NextResponse.json({ message: 'Server error', error: String(err) }, { status: 500 });
    }
}

// Helpers (tidak diubah)
async function writeWithRetry(filePath: string, data: Buffer, maxTry = 3) {
    let attempt = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (true) {
        try {
            await fs.writeFile(filePath, data);
            return;
        } catch (e: any) {
            if ((e.code === 'EBUSY' || e.code === 'EPERM') && attempt < maxTry - 1) {
                attempt++;
                await sleep(100 * attempt);
                continue;
            }
            throw e;
        }
    }
}

async function safeUnlink(filePath: string) {
    try {
        await fs.unlink(filePath);
    } catch (e: any) {
        if (e.code === 'EBUSY' || e.code === 'EPERM') {
            await new Promise((r) => setTimeout(r, 150));
            try {
                await fs.unlink(filePath);
            } catch {
                // diam
            }
        }
    }
}

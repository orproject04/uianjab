// src/app/api/upload-anjab/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {NextRequest, NextResponse} from "next/server";
import {spawn} from "child_process";
import * as fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";

/** ====== ENV helpers: pastikan proses anak bisa akses soffice & python ====== */
function buildSpawnEnv() {
    const env = {...process.env};
    const sofficeDir = process.env.SOFFICE_DIR || "";
    if (sofficeDir) {
        env.PATH = env.PATH ? `${env.PATH};${sofficeDir}` : sofficeDir;
    }
    if (process.env.SOFFICE_BIN) {
        env.SOFFICE_BIN = process.env.SOFFICE_BIN;
    }
    return env;
}

function getPythonBin() {
    return process.env.PYTHON_BIN || "python";
}

/** =================== ROUTE =================== */
export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json(
                {error: "Forbidden, Anda tidak berhak mengakses fitur ini"},
                {status: 403}
            );
        }

        const formData = await req.formData();
        const jabatan_id = ((formData.get("jabatan_id") as string | null) || null);

        if (!jabatan_id) {
            return NextResponse.json({error: "jabatan_id wajib dikirim"}, {status: 400});
        }

        // Cegah duplikat - cek apakah jabatan_id sudah punya data
        {
            const dup = await pool.query<{ exists: boolean }>(
                `SELECT EXISTS(SELECT 1 FROM jabatan WHERE id = $1::uuid) AS exists`,
                [jabatan_id]
            );
            if (dup.rows[0]?.exists) {
                return NextResponse.json(
                    {error: "Upload gagal, Jabatan sudah mempunyai Anjab"},
                    {status: 409}
                );
            }
        }

        // Ambil file tunggal
        let file: File | null = null;
        const directFile = formData.get("file");
        if (directFile instanceof File) file = directFile;
        if (!file) {
            const files = formData.getAll("files").filter((f) => f instanceof File) as File[];
            if (files.length > 1) {
                return NextResponse.json({error: "Maksimal 1 file per upload"}, {status: 400});
            }
            file = files[0] ?? null;
        }
        if (!file) {
            return NextResponse.json({error: "Tidak ada file yang dikirim"}, {status: 400});
        }

        // Siapkan eksekusi extractor
        const scriptPath = path.resolve(process.cwd(), "scripts", "ekstrakanjab.py");
        const sessionTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "anjab-"));

        try {
            const ext = path.extname(file.name) || ".doc";
            const base = path
                .basename(file.name, ext)
                .replace(/[^\w\-]+/g, "_")
                .slice(0, 80);
            const unique = crypto.randomUUID();
            const tempDocPath = path.join(sessionTmpDir, `${base}-${unique}${ext}`);

            const buffer = Buffer.from(await file.arrayBuffer());
            await writeWithRetry(tempDocPath, buffer);

            // Jalankan python extractor
            let stdoutData = "";
            let stderrData = "";
            const pythonBin = getPythonBin();
            const spawnEnv = buildSpawnEnv();

            const exitCode: number = await new Promise((resolve, reject) => {
                const child = spawn(pythonBin, [scriptPath, tempDocPath], {
                    windowsHide: true,
                    env: spawnEnv,
                    stdio: ["ignore", "pipe", "pipe"],
                });
                child.stdout.on("data", (d) => (stdoutData += d.toString()));
                child.stderr.on("data", (d) => (stderrData += d.toString()));
                child.on("close", (code) => resolve(code ?? 1));
                child.on("error", reject);
            });

            await safeUnlink(tempDocPath);

            if (exitCode !== 0 || !stdoutData) {
                return NextResponse.json(
                    {error: "Gagal mengekstrak dokumen", detail: stderrData || "no output"},
                    {status: 422}
                );
            }

            // Parse hasil extractor
            let item: any;
            try {
                item = JSON.parse(stdoutData);
            } catch (e) {
                return NextResponse.json(
                    {error: "Output extractor bukan JSON yang valid"},
                    {status: 422}
                );
            }

            const {
                nama_jabatan,
                kode_jabatan,
                ikhtisar_jabatan,
                kelas_jabatan,
                prestasi_yang_diharapkan,
                unit_kerja = {},
                kualifikasi_jabatan = {},
                tugas_pokok = [],
                hasil_kerja = [],
                bahan_kerja = [],
                perangkat_kerja = [],
                tanggung_jawab = [],
                wewenang = [],
                korelasi_jabatan = [],
                kondisi_lingkungan_kerja = [],
                risiko_bahaya = [],
                syarat_jabatan = {},
            } = item;

            if (!nama_jabatan || !kode_jabatan) {
                return NextResponse.json(
                    {error: "Data penting tidak lengkap (nama_jabatan/kode_jabatan)"},
                    {status: 400}
                );
            }

            // Check for duplicate nama_jabatan
            const duplicateCheck = await pool.query(
                'SELECT id FROM jabatan WHERE LOWER(TRIM(nama_jabatan)) = LOWER(TRIM($1)) LIMIT 1',
                [nama_jabatan]
            );

            if (duplicateCheck.rows.length > 0) {
                return NextResponse.json(
                    {error: `Upload gagal, Anjab dengan nama "${nama_jabatan}" sudah ada`},
                    {status: 409}
                );
            }

            const client = await pool.connect();
            try {
                await client.query("BEGIN");

                // jabatan - use provided jabatan_id (UUID) instead of generating new one
                await client.query(
                    `
                        INSERT INTO jabatan
                        (id, kode_jabatan, nama_jabatan, ikhtisar_jabatan, kelas_jabatan,
                         prestasi_diharapkan, created_at, updated_at)
                        VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW(), NOW())
                    `,
                    [
                        jabatan_id,
                        String(kode_jabatan),
                        String(nama_jabatan),
                        ikhtisar_jabatan || "",
                        kelas_jabatan || "",
                        prestasi_yang_diharapkan || "",
                    ]
                );
                const jabatanUUID = jabatan_id;

                // unit_kerja
                await client.query(
                    `
                        INSERT INTO unit_kerja (jabatan_id, jpt_utama, jpt_madya, jpt_pratama, administrator,
                                                pengawas, pelaksana, jabatan_fungsional, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                    `,
                    [
                        jabatanUUID,
                        unit_kerja["JPT Utama"] || "",
                        unit_kerja["JPT Madya"] || "",
                        unit_kerja["JPT Pratama"] || "",
                        unit_kerja["Administrator"] || "",
                        unit_kerja["Pengawas"] || "",
                        unit_kerja["Pelaksana"] || "",
                        unit_kerja["Jabatan Fungsional"] || "",
                    ]
                );

                // kualifikasi_jabatan
                const {
                    pendidikan_formal = "",
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
                    : typeof pendidikan_formal === "string" && pendidikan_formal.trim() !== ""
                        ? [pendidikan_formal]
                        : [];

                await client.query(
                    `
                        INSERT INTO kualifikasi_jabatan (jabatan_id, pendidikan_formal, diklat_penjenjangan,
                                                         diklat_teknis, diklat_fungsional, pengalaman_kerja,
                                                         created_at, updated_at)
                        VALUES ($1, $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], NOW(), NOW())
                    `,
                    [
                        jabatanUUID,
                        pendidikan_formal_arr,
                        diklat_penjenjangan,
                        diklat_teknis,
                        diklat_fungsional,
                        Array.isArray(pengalaman_kerja) ? pengalaman_kerja : [],
                    ]
                );

                // ==========================
                // tugas_pokok + tahapan + detail_uraian_tugas
                // ==========================
                for (const tugas of Array.isArray(tugas_pokok) ? tugas_pokok : []) {
                    const nomor_tugas = parseInt(tugas.no) || null;
                    const uraian = tugas?.uraian_tugas?.deskripsi || "";
                    const detailArr: any[] = Array.isArray(tugas?.uraian_tugas?.detail_uraian_tugas)
                        ? tugas.uraian_tugas.detail_uraian_tugas
                        : [];

                    // hasil_kerja → pastikan array & cast text[]
                    const hasilK: string[] = Array.isArray(tugas?.uraian_tugas?.hasil_kerja)
                        ? tugas.uraian_tugas.hasil_kerja
                        : Array.isArray(tugas?.hasil_kerja)
                            ? tugas.hasil_kerja
                            : [];

                    const jumlah_hasil = tugas.jumlah_hasil ? parseInt(tugas.jumlah_hasil) : null;
                    const waktu_penyelesaian_jam = tugas["waktu_penyelesaian_(jam)"]
                        ? parseInt(tugas["waktu_penyelesaian_(jam)"])
                        : null;
                    const waktu_efektif = tugas.waktu_efektif ? parseInt(tugas.waktu_efektif) : null;
                    const kebutuhan_pegawai = tugas.kebutuhan_pegawai
                        ? parseInt(tugas.kebutuhan_pegawai)
                        : null;

                    // Insert tugas_pokok WITHOUT legacy ABK columns
                    const resTugas = await client.query<{ id: number }>(
                        `
                            INSERT INTO tugas_pokok (jabatan_id, nomor_tugas, uraian_tugas, hasil_kerja, created_at, updated_at)
                            VALUES ($1, $2, $3, $4::text[], NOW(), NOW()) RETURNING id
                        `,
                        [
                            jabatanUUID,
                            nomor_tugas,
                            uraian,
                            hasilK,
                        ]
                    );

                    const tugas_id = resTugas.rows[0].id;

                    // If ABK fields exist in payload and a peta_jabatan exists for this jabatan, upsert into tugas_pokok_abk
                    try {
                        const petaQ = await client.query(`SELECT id FROM peta_jabatan WHERE jabatan_id = $1 LIMIT 1`, [jabatanUUID]);
                        const petaId = petaQ.rows[0]?.id ?? null;
                        if (petaId) {
                            const jumlah = jumlah_hasil;
                            const waktu_pen = waktu_penyelesaian_jam;
                            const waktu_eff = waktu_efektif;
                            const kebutuhan = kebutuhan_pegawai !== null
                                ? kebutuhan_pegawai
                                : ((waktu_eff && waktu_eff > 0 && jumlah != null && waktu_pen != null)
                                    ? (Number(jumlah || 0) * Number(waktu_pen || 0)) / Number(waktu_eff)
                                    : null);

                            await client.query(
                                `
                                    INSERT INTO tugas_pokok_abk (peta_jabatan_id, tugas_pokok_id, jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, created_at, updated_at)
                                    VALUES ($1::uuid, $2::int, $3, $4, $5, $6, NOW(), NOW())
                                    ON CONFLICT (peta_jabatan_id, tugas_pokok_id) DO UPDATE SET
                                      jumlah_hasil = EXCLUDED.jumlah_hasil,
                                      waktu_penyelesaian_jam = EXCLUDED.waktu_penyelesaian_jam,
                                      waktu_efektif = EXCLUDED.waktu_efektif,
                                      kebutuhan_pegawai = EXCLUDED.kebutuhan_pegawai,
                                      updated_at = NOW()
                                `,
                                [petaId, tugas_id, jumlah, waktu_pen, waktu_eff, kebutuhan]
                            );

                            // update peta kebutuhan
                            await client.query(
                                `UPDATE peta_jabatan so
                                 SET kebutuhan_pegawai = COALESCE((SELECT CEIL(COALESCE(SUM(tpa.kebutuhan_pegawai)::numeric,0)) FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = so.id),0), updated_at = NOW()
                                 WHERE so.id = $1::uuid`,
                                [petaId]
                            );
                        }
                    } catch (e) {
                        console.error('[anjab/docs] ABK insert failed', e);
                    }

                    // Insert tahapan (nomor_tahapan auto i+1 jika tidak ada di JSON)
                    for (let i = 0; i < detailArr.length; i++) {
                        const td = detailArr[i] || {};
                        const nomor_tahapan: number = Number.isInteger(td.nomor_tahapan) ? td.nomor_tahapan : i + 1;
                        const tahapanText: string = td.tahapan || "";
                        const detailList: string[] = Array.isArray(td.detail_tahapan) ? td.detail_tahapan : [];

                        const insTah = await client.query<{ id: number }>(
                            `
                                INSERT INTO tahapan_uraian_tugas
                                    (tugas_id, jabatan_id, tahapan, nomor_tahapan, created_at, updated_at)
                                VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id
                            `,
                            [tugas_id, jabatanUUID, tahapanText, nomor_tahapan]
                        );
                        const tahapan_id = insTah.rows[0].id;

                        // Insert detail_tahapan bila ada
                        if (detailList.length) {
                            for (const det of detailList) {
                                await client.query(
                                    `
                                        INSERT INTO detail_tahapan_uraian_tugas
                                            (tahapan_id, jabatan_id, detail, created_at, updated_at)
                                        VALUES ($1, $2, $3, NOW(), NOW())
                                    `,
                                    [tahapan_id, jabatanUUID, det]
                                );
                            }
                        }
                    }
                }

                // hasil_kerja (tabel lain), bahan_kerja, perangkat_kerja, dst. (tidak diubah)
                for (const hk of Array.isArray(hasil_kerja) ? hasil_kerja : []) {
                    await client.query(
                        `
                            INSERT INTO hasil_kerja (jabatan_id, hasil_kerja, satuan_hasil, created_at, updated_at)
                            VALUES ($1, $2::text[], $3::text[], NOW(), NOW())
                        `,
                        [
                            jabatanUUID,
                            Array.isArray(hk.hasil_kerja) ? hk.hasil_kerja : [],
                            Array.isArray(hk.satuan_hasil) ? hk.satuan_hasil : [],
                        ]
                    );
                }

                for (const bk of Array.isArray(bahan_kerja) ? bahan_kerja : []) {
                    await client.query(
                        `
                            INSERT INTO bahan_kerja (jabatan_id, bahan_kerja, penggunaan_dalam_tugas, created_at,
                                                     updated_at)
                            VALUES ($1, $2::text[], $3::text[], NOW(), NOW())
                        `,
                        [jabatanUUID, bk.bahan_kerja || [], bk.penggunaan_dalam_tugas || []]
                    );
                }

                for (const pk of Array.isArray(perangkat_kerja) ? perangkat_kerja : []) {
                    await client.query(
                        `
                            INSERT INTO perangkat_kerja (jabatan_id, perangkat_kerja, penggunaan_untuk_tugas,
                                                         created_at, updated_at)
                            VALUES ($1, $2::text[], $3::text[], NOW(), NOW())
                        `,
                        [jabatanUUID, pk.perangkat_kerja || [], pk.penggunaan_untuk_tugas || []]
                    );
                }

                for (const tj of Array.isArray(tanggung_jawab) ? tanggung_jawab : []) {
                    await client.query(
                        `
                            INSERT INTO tanggung_jawab (jabatan_id, uraian_tanggung_jawab, created_at, updated_at)
                            VALUES ($1, $2, NOW(), NOW())
                        `,
                        [jabatanUUID, tj.uraian || ""]
                    );
                }

                for (const w of Array.isArray(wewenang) ? wewenang : []) {
                    await client.query(
                        `
                            INSERT INTO wewenang (jabatan_id, uraian_wewenang, created_at, updated_at)
                            VALUES ($1, $2, NOW(), NOW())
                        `,
                        [jabatanUUID, w.uraian || ""]
                    );
                }

                for (const k of Array.isArray(korelasi_jabatan) ? korelasi_jabatan : []) {
                    await client.query(
                        `
                            INSERT INTO korelasi_jabatan (jabatan_id, jabatan_terkait, unit_kerja_instansi, dalam_hal,
                                                          created_at, updated_at)
                            VALUES ($1, $2, $3, $4::text[], NOW(), NOW())
                        `,
                        [jabatanUUID, k.jabatan || "", k.unit_kerja_instansi || "", k.dalam_hal || []]
                    );
                }

                for (const kl of Array.isArray(kondisi_lingkungan_kerja) ? kondisi_lingkungan_kerja : []) {
                    await client.query(
                        `
                            INSERT INTO kondisi_lingkungan_kerja (jabatan_id, aspek, faktor, created_at, updated_at)
                            VALUES ($1, $2, $3, NOW(), NOW())
                        `,
                        [jabatanUUID, kl.aspek || "", kl.faktor || ""]
                    );
                }

                for (const rb of Array.isArray(risiko_bahaya) ? risiko_bahaya : []) {
                    await client.query(
                        `
                            INSERT INTO risiko_bahaya (jabatan_id, nama_risiko, penyebab, created_at, updated_at)
                            VALUES ($1, $2, $3, NOW(), NOW())
                        `,
                        [jabatanUUID, rb.nama_risiko || "", rb.penyebab || ""]
                    );
                }

                const syarat = syarat_jabatan || {};
                await client.query(
                    `
                        INSERT INTO syarat_jabatan (jabatan_id, keterampilan_kerja, bakat_kerja, temperamen_kerja,
                                                    minat_kerja, upaya_fisik,
                                                    kondisi_fisik_jenkel, kondisi_fisik_umur, kondisi_fisik_tb,
                                                    kondisi_fisik_bb, kondisi_fisik_pb,
                                                    kondisi_fisik_tampilan, kondisi_fisik_keadaan, fungsi_pekerja,
                                                    created_at, updated_at)
                        VALUES ($1, $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
                                $7, $8, $9, $10, $11, $12, $13, $14::text[], NOW(), NOW())
                    `,
                    [
                        jabatanUUID,
                        syarat.keterampilan_kerja || [],
                        syarat.bakat_kerja || [],
                        syarat.temperamen_kerja || [],
                        syarat.minat_kerja || [],
                        syarat.upaya_fisik || [],
                        syarat.kondisi_fisik?.jenis_kelamin || "",
                        syarat.kondisi_fisik?.umur || "",
                        syarat.kondisi_fisik?.tinggi_badan || "",
                        syarat.kondisi_fisik?.berat_badan || "",
                        syarat.kondisi_fisik?.postur_badan || "",
                        syarat.kondisi_fisik?.penampilan || "",
                        syarat.kondisi_fisik?.keadaan_fisik || "",
                        syarat.fungsi_pekerja || [],
                    ]
                );

                await client.query("COMMIT");

                return NextResponse.json(
                    {
                        ok: true,
                        message: "Upload berhasil",
                        jabatan_id: jabatanUUID,
                    },
                    {status: 201}
                );
            } catch (err: any) {
                await client.query("ROLLBACK");
                if (err?.code === "23505") {
                    return NextResponse.json(
                        {error: "Upload gagal, Jabatan sudah mempunyai Anjab"},
                        {status: 409}
                    );
                }
                return NextResponse.json(
                    {error: "Gagal menyimpan ke database", detail: String(err)},
                    {status: 500}
                );
            } finally {
                client.release();
            }
        } finally {
            await fs.rm(sessionTmpDir, {recursive: true, force: true});
        }
    } catch (err) {
        return NextResponse.json({error: "Server error", detail: String(err)}, {status: 500});
    }
}

/* ================= Helpers ================= */
async function writeWithRetry(filePath: string, data: Buffer, maxTry = 3) {
    let attempt = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (true) {
        try {
            await fs.writeFile(filePath, data);
            return;
        } catch (e: any) {
            if ((e.code === "EBUSY" || e.code === "EPERM") && attempt < maxTry - 1) {
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
        if (e.code === "EBUSY" || e.code === "EPERM") {
            await new Promise((r) => setTimeout(r, 150));
            try {
                await fs.unlink(filePath);
            } catch {/* ignore */
            }
        }
    }
}

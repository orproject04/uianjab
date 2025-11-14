// app/api/anjab/upload-abk/route.ts
import {NextRequest, NextResponse} from "next/server";
import {spawn} from "child_process";
import * as fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";

/** ====== ENV helpers: pastikan proses anak bisa akses python/soffice ====== */
function buildSpawnEnv() {
    const env = {...process.env};

    // Untuk Windows lokal (opsional): SOFFICE_DIR menambah PATH
    const sofficeDir = process.env.SOFFICE_DIR || "";
    if (sofficeDir) {
        env.PATH = env.PATH ? `${env.PATH};${sofficeDir}` : sofficeDir;
    }

    // Linux: set jalur absolut jika ada
    if (process.env.SOFFICE_BIN) {
        env.SOFFICE_BIN = process.env.SOFFICE_BIN;
    }

    return env;
}

function getPythonBin() {
    // Di container Linux: gunakan python3
    // Bisa override lewat ENV: PYTHON_BIN=/usr/bin/python3
    return process.env.PYTHON_BIN || "python3";
}

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

        // Param wajib: jabatan_id (UUID) dan peta_jabatan_id
        let id = (formData.get("jabatan_id") as string | null)?.trim() || null;
        if (!id) {
            id = (formData.get("id") as string | null)?.trim() || null;
        }
        if (!id) {
            return NextResponse.json({message: "jabatan_id wajib dikirim"}, {status: 400});
        }
        if (!isValidUuid(id)) {
            return NextResponse.json({message: "Invalid, jabatan_id harus UUID"}, {status: 400});
        }

        let peta_jabatan_id = (formData.get("peta_jabatan_id") as string | null)?.trim() || null;
        if (!peta_jabatan_id) {
            return NextResponse.json({message: "peta_jabatan_id wajib dikirim"}, {status: 400});
        }
        if (!isValidUuid(peta_jabatan_id)) {
            return NextResponse.json({message: "Invalid, peta_jabatan_id harus UUID"}, {status: 400});
        }

        // Ambil tepat 1 file
        let file: File | null = null;
        const directFile = formData.get("file");
        if (directFile instanceof File) file = directFile;
        if (!file) {
            const files = formData.getAll("files").filter((f) => f instanceof File) as File[];
            if (files.length > 1) {
                return NextResponse.json({message: "Maksimal 1 file per upload"}, {status: 400});
            }
            file = files[0] ?? null;
        }
        if (!file) {
            return NextResponse.json({message: "Tidak ada file yang dikirim"}, {status: 400});
        }

        const scriptPath = path.resolve(process.cwd(), "scripts", "ekstrakabk.py");
        const sessionTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "anjab-abk-"));

        try {
            // 1) Simpan file ke temp unik
            const ext = path.extname(file.name) || ".doc";
            const base = path.basename(file.name, ext).replace(/[^\w\-]+/g, "_").slice(0, 80);
            const unique = crypto.randomUUID();
            const tempDocPath = path.join(sessionTmpDir, `${base}-${unique}${ext}`);

            const buffer = Buffer.from(await file.arrayBuffer());
            await writeWithRetry(tempDocPath, buffer);

            // 2) Jalankan Python extractor
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
                console.error("❌ Ekstraksi gagal:", stderrData);
                return NextResponse.json(
                    {message: "Gagal mengekstrak dokumen", detail: stderrData || "no output"},
                    {status: 422}
                );
            }

            // 3) Parse JSON & update DB
            let parsed: any;
            try {
                parsed = JSON.parse(stdoutData);
            } catch (e) {
                console.error("❌ JSON extractor tidak valid:", e, "\nRAW:\n", stdoutData);
                return NextResponse.json(
                    {message: "Output extractor bukan JSON yang valid"},
                    {status: 422}
                );
            }

            const {tugas_pokok = []} = parsed;
            if (!Array.isArray(tugas_pokok) || tugas_pokok.length === 0) {
                return NextResponse.json(
                    {message: "Tidak ada data tugas_pokok pada file yang diunggah"},
                    {status: 400}
                );
            }

            const client = await pool.connect();
            try {
                await client.query("BEGIN");

                // Verifikasi peta_jabatan exists
                const {rows: petaRows} = await client.query(
                    "SELECT id FROM peta_jabatan WHERE id = $1::uuid AND jabatan_id = $2::uuid LIMIT 1",
                    [peta_jabatan_id, id]
                );

                if (petaRows.length === 0) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                        {
                            message: "Peta jabatan tidak ditemukan atau tidak sesuai dengan jabatan_id",
                            error: "Not Found",
                        },
                        {status: 404}
                    );
                }

                // Get existing tugas_pokok for this jabatan (only need id and basic info)
                const {rows: tugasPokok} = await client.query(
                    `SELECT id as tugas_pokok_id, nomor_tugas, uraian_tugas, hasil_kerja
                     FROM tugas_pokok 
                     WHERE jabatan_id = $1 
                     ORDER BY nomor_tugas ASC`,
                    [id]
                );

                if (tugasPokok.length !== tugas_pokok.length) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                        {
                            message: "Panjang data tidak sesuai",
                            error: `Jumlah Tugas Pokok di Anjab: ${tugasPokok.length}, Jumlah Tugas Pokok di ABK: ${tugas_pokok.length}. Silakan cek kembali dokumen ABK Anda.`,
                        },
                        {status: 400}
                    );
                }

                // Delete existing tugas_pokok_abk for this peta_jabatan
                await client.query(
                    "DELETE FROM tugas_pokok_abk WHERE peta_jabatan_id = $1",
                    [peta_jabatan_id]
                );

                // Akumulator total kebutuhan_pegawai
                let totalKebutuhanPegawai = 0;
                let inserted = 0;

                // Insert into tugas_pokok_abk based on uploaded ABK data
                for (let i = 0; i < tugas_pokok.length; i++) {
                    const t = tugas_pokok[i];
                    const tp = tugasPokok[i];

                    const jumlah_hasil = toIntOrNull(t?.beban_kerja);
                    const waktu_penyelesaian_jam = toIntOrNull(t?.waktu_penyelesaian);
                    const waktu_efektif = toIntOrNull(t?.waktu_kerja_efektif);

                    // Hitung kebutuhan_pegawai dengan formula: (jumlah_hasil * waktu_penyelesaian) / waktu_efektif
                    let kebutuhan_pegawai = 0;
                    if (jumlah_hasil && waktu_penyelesaian_jam && waktu_efektif && waktu_efektif > 0) {
                        kebutuhan_pegawai = (jumlah_hasil * waktu_penyelesaian_jam) / waktu_efektif;
                    }

                    if (typeof kebutuhan_pegawai === "number" && Number.isFinite(kebutuhan_pegawai)) {
                        totalKebutuhanPegawai += kebutuhan_pegawai;
                    }

                    // Insert into tugas_pokok_abk (kebutuhan_pegawai dihitung, bukan dari file)
                    await client.query(
                        `
                            INSERT INTO tugas_pokok_abk (
                                peta_jabatan_id,
                                tugas_pokok_id,
                                jumlah_hasil,
                                waktu_penyelesaian_jam,
                                waktu_efektif,
                                kebutuhan_pegawai,
                                created_at,
                                updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                        `,
                        [
                            peta_jabatan_id,
                            tp.tugas_pokok_id,
                            jumlah_hasil,
                            waktu_penyelesaian_jam,
                            waktu_efektif,
                            kebutuhan_pegawai,
                        ]
                    );
                    inserted++;
                }

                // Update total (dibulatkan ke atas) ke peta_jabatan.kebutuhan_pegawai
                const totalRounded = Math.ceil(totalKebutuhanPegawai);
                await client.query(
                    `
                        UPDATE peta_jabatan
                        SET kebutuhan_pegawai = $1,
                            updated_at        = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `,
                    [totalRounded, peta_jabatan_id]
                );

                await client.query("COMMIT");
                return NextResponse.json({
                    ok: true,
                    message: `Upload ABK sukses untuk ${inserted} tugas pokok`,
                    jabatan_id: id,
                    inserted: inserted,
                });
            } catch (err) {
                await client.query("ROLLBACK");
                console.error("❌ Error update DB:", err);
                return NextResponse.json(
                    {message: "Gagal menyimpan ke database", detail: String(err)},
                    {status: 500}
                );
            } finally {
                client.release();
            }
        } finally {
            await fs.rm(sessionTmpDir, {recursive: true, force: true});
        }
    } catch (err) {
        console.error("❌ Upload error:", err);
        return NextResponse.json({message: "Server error", detail: String(err)}, {status: 500});
    }
}

/* ============ Helpers ============ */

function isValidUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toIntOrNull(val: unknown): number | null {
    if (typeof val === "number") return Number.isFinite(val) ? Math.trunc(val) : null;
    if (typeof val === "string" && val.trim() !== "") {
        const n = parseInt(val, 10);
        return Number.isNaN(n) ? null : n;
    }
    return null;
}

function toFloatOrNull(val: unknown): number | null {
    if (typeof val === "number") return Number.isFinite(val) ? val : null;
    if (typeof val === "string" && val.trim() !== "") {
        const n = parseFloat(val);
        return Number.isNaN(n) ? null : n;
    }
    return null;
}

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
        if (e.code === "EBUSY" || e.code === "EPERM" || e.code === "ENOENT") {
            await new Promise((r) => setTimeout(r, 150));
            try {
                await fs.unlink(filePath);
            } catch {
                // dibiarkan; rm(sessionTmpDir) akan bersih-bersih
            }
        } else {
            throw e;
        }
    }
}

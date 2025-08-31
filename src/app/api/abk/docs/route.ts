// app/api/anjab/upload-abk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const files = formData.getAll("files") as File[];
        const id_jabatan = formData.get("id_jabatan") as string | null;

        if (!id_jabatan) {
            return NextResponse.json({ message: "id_jabatan wajib dikirim" }, { status: 400 });
        }
        if (!files.length) {
            return NextResponse.json({ message: "Tidak ada file yang dikirim" }, { status: 400 });
        }

        const results: any[] = [];
        const scriptPath = path.resolve(process.cwd(), "scripts", "ekstrakabk.py");

        // Buat temp dir unik per request di OS temp (aman di Windows/Linux/Mac)
        const sessionTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "anjab-abk-"));

        try {
            for (const file of files) {
                // --- 1) Simpan file ke nama unik di temp dir ---
                const ext = path.extname(file.name) || ".doc";
                const base = path.basename(file.name, ext).replace(/[^\w\-]+/g, "_");
                const unique = crypto.randomUUID();
                const tempDocPath = path.join(sessionTmpDir, `${base}-${unique}${ext}`);

                const buffer = Buffer.from(await file.arrayBuffer());
                await writeWithRetry(tempDocPath, buffer);

                // --- 2) Jalankan Python extractor ---
                let stdoutData = "";
                let stderrData = "";

                const exitCode: number = await new Promise((resolve, reject) => {
                    const python = spawn("python", [scriptPath, tempDocPath], { windowsHide: true });
                    python.stdout.on("data", (d) => (stdoutData += d.toString()));
                    python.stderr.on("data", (d) => (stderrData += d.toString()));
                    python.on("close", (code) => resolve(code ?? 1));
                    python.on("error", reject);
                });

                // Hapus file tmp (kalau masih locked, biarkan rm(sessionTmpDir) di finally yang bersih-bersih)
                await safeUnlink(tempDocPath);

                if (exitCode !== 0 || !stdoutData) {
                    console.error(`❌ Gagal ekstrak ${file.name}:`, stderrData);
                    results.push({ file: file.name, status: "extract_failed", error: stderrData });
                    continue;
                }

                // --- 3) Parse JSON & update DB ---
                try {
                    const item = JSON.parse(stdoutData);
                    const { tugas_pokok = [] } = item;

                    if (!Array.isArray(tugas_pokok) || tugas_pokok.length === 0) {
                        console.warn(`⚠️ Tidak ada tugas_pokok untuk file: ${file.name}`);
                        results.push({ file: file.name, status: "missing_tugas" });
                        continue;
                    }

                    const client = await pool.connect();
                    try {
                        await client.query("BEGIN");

                        // Ambil data lama untuk validasi jumlah baris
                        const { rows: existing } = await client.query(
                            "SELECT nomor_tugas FROM tugas_pokok WHERE id_jabatan = $1 ORDER BY nomor_tugas ASC",
                            [id_jabatan]
                        );

                        if (existing.length !== tugas_pokok.length) {
                            return NextResponse.json({ message: `Jumlah tugas_pokok di Anjab (${existing.length}) tidak sama dengan tugas_pokok di ABK yang diunggah (${tugas_pokok.length})`, error: "Bad Request"  }, { status: 400 });
                        }

                        // Update by nomor_tugas (urutannya mengikuti existing)
                        for (let i = 0; i < tugas_pokok.length; i++) {
                            const t = tugas_pokok[i];

                            const jumlah_hasil = t.beban_kerja ? parseInt(t.beban_kerja) : null;
                            const waktu_penyelesaian_jam = t.waktu_penyelesaian ? parseInt(t.waktu_penyelesaian) : null;
                            const waktu_efektif = t.waktu_kerja_efektif ? parseInt(t.waktu_kerja_efektif) : null;

                            // pegawai_dibutuhkan bisa mengandung koma desimal
                            const kebutuhan_pegawai =
                                typeof t.pegawai_dibutuhkan === "string"
                                    ? parseFloat(t.pegawai_dibutuhkan.replace(",", "."))
                                    : t.pegawai_dibutuhkan ?? null;

                            await client.query(
                                `UPDATE tugas_pokok
                   SET jumlah_hasil = $1,
                       waktu_penyelesaian_jam = $2,
                       waktu_efektif = $3,
                       kebutuhan_pegawai = $4,
                       updated_at = NOW()
                 WHERE id_jabatan = $5 AND nomor_tugas = $6`,
                                [
                                    jumlah_hasil,
                                    waktu_penyelesaian_jam,
                                    waktu_efektif,
                                    kebutuhan_pegawai,
                                    id_jabatan,
                                    existing[i].nomor_tugas,
                                ]
                            );
                        }

                        await client.query("COMMIT");
                        results.push({ file: file.name, status: "success", id_jabatan });
                    } catch (err) {
                        await client.query("ROLLBACK");
                        console.error(`❌ Error update data untuk ${file.name}:`, err);
                        results.push({ file: file.name, status: "failed", error: String(err) });
                    } finally {
                        client.release();
                    }
                } catch (jsonErr) {
                    console.error(`❌ JSON tidak valid dari ${file.name}:`, jsonErr);
                    results.push({ file: file.name, status: "invalid_json" });
                }
            }

            return NextResponse.json({
                message: `Proses selesai (${results.filter((r) => r.status === "success").length} sukses)`,
                detail: results,
            });
        } finally {
            // Bersihkan seluruh session temp dir
            await fs.rm(sessionTmpDir, { recursive: true, force: true });
        }
    } catch (err) {
        console.error("❌ Upload error:", err);
        return NextResponse.json({ message: "Server error", error: String(err) }, { status: 500 });
    }
}

/* ===== Helpers ===== */

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
                await sleep(100 * attempt); // backoff singkat
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
            // tunggu sebentar lalu coba sekali lagi
            await new Promise((r) => setTimeout(r, 150));
            try {
                await fs.unlink(filePath);
            } catch {
                // biarkan: rm(sessionTmpDir) akan bersih-bersih
            }
        } else {
            // error lain biar bubble up untuk diagnosa
            throw e;
        }
    }
}

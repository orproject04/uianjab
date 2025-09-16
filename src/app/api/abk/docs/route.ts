// app/api/anjab/upload-abk/route.ts
import {NextRequest, NextResponse} from "next/server";
import {spawn} from "child_process";
import * as fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import pool from "@/lib/db";
import {getUserFromReq, hasRole} from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({error: "Forbidden, Anda tidak berhak mengakses fitur ini"}, {status: 403});
        }

        const formData = await req.formData();

        // Param wajib: id = jabatan_id (UUID)
        const id = (formData.get("id") as string | null)?.trim() || null;
        if (!id) {
            return NextResponse.json({message: "id wajib dikirim"}, {status: 400});
        }
        if (!isValidUuid(id)) {
            return NextResponse.json({message: "Invalid, id harus UUID"}, {status: 400});
        }

        // Ambil tepat 1 file: dukung "file" atau "files" tapi maksimal 1
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
            // --- 1) Simpan file ke temp unik ---
            const ext = path.extname(file.name) || ".doc";
            const base = path.basename(file.name, ext).replace(/[^\w\-]+/g, "_").slice(0, 80);
            const unique = crypto.randomUUID();
            const tempDocPath = path.join(sessionTmpDir, `${base}-${unique}${ext}`);

            const buffer = Buffer.from(await file.arrayBuffer());
            await writeWithRetry(tempDocPath, buffer);

            // --- 2) Jalankan Python extractor ---
            let stdoutData = "";
            let stderrData = "";

            const exitCode: number = await new Promise((resolve, reject) => {
                const python = spawn("python", [scriptPath, tempDocPath], {windowsHide: true});
                python.stdout.on("data", (d) => (stdoutData += d.toString()));
                python.stderr.on("data", (d) => (stderrData += d.toString()));
                python.on("close", (code) => resolve(code ?? 1));
                python.on("error", reject);
            });

            await safeUnlink(tempDocPath);

            if (exitCode !== 0 || !stdoutData) {
                console.error("❌ Ekstraksi gagal:", stderrData);
                return NextResponse.json(
                    {message: "Gagal mengekstrak dokumen", detail: stderrData || "no output"},
                    {status: 422}
                );
            }

            // --- 3) Parse JSON & update DB ---
            let parsed: any;
            try {
                parsed = JSON.parse(stdoutData);
            } catch (e) {
                console.error("❌ JSON extractor tidak valid:", e);
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

                // Ambil tugas existing untuk jabatan ini (urut nomor_tugas)
                const {rows: existing} = await client.query(
                    "SELECT nomor_tugas FROM tugas_pokok WHERE jabatan_id = $1 ORDER BY nomor_tugas ASC",
                    [id]
                );

                if (existing.length !== tugas_pokok.length) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                        {
                            message: `Jumlah tugas_pokok di Anjab (${existing.length}) tidak sama dengan tugas_pokok di ABK yang diunggah (${tugas_pokok.length})`,
                            error: "Bad Request",
                        },
                        {status: 400}
                    );
                }

                // --- Tambahan: akumulator total kebutuhan_pegawai ---
                let totalKebutuhanPegawai = 0;

                // Update berdasarkan urutan existing (nomor_tugas)
                let updated = 0;
                for (let i = 0; i < tugas_pokok.length; i++) {
                    const t = tugas_pokok[i];

                    const jumlah_hasil = toIntOrNull(t?.beban_kerja);
                    const waktu_penyelesaian_jam = toIntOrNull(t?.waktu_penyelesaian);
                    const waktu_efektif = toIntOrNull(t?.waktu_kerja_efektif);

                    // pegawai_dibutuhkan bisa desimal dengan koma
                    const kebutuhan_pegawai =
                        typeof t?.pegawai_dibutuhkan === "string"
                            ? toFloatOrNull(t.pegawai_dibutuhkan.replace(",", "."))
                            : t?.pegawai_dibutuhkan ?? null;

                    // --- Tambahan: akumulasi jika valid number ---
                    if (typeof kebutuhan_pegawai === "number" && Number.isFinite(kebutuhan_pegawai)) {
                        totalKebutuhanPegawai += kebutuhan_pegawai;
                    }

                    await client.query(
                        `
                            UPDATE tugas_pokok
                            SET jumlah_hasil           = $1,
                                waktu_penyelesaian_jam = $2,
                                waktu_efektif          = $3,
                                kebutuhan_pegawai      = $4,
                                updated_at             = NOW()
                            WHERE jabatan_id = $5
                              AND nomor_tugas = $6
                        `,
                        [
                            jumlah_hasil,
                            waktu_penyelesaian_jam,
                            waktu_efektif,
                            kebutuhan_pegawai,
                            id,
                            existing[i].nomor_tugas,
                        ]
                    );
                    updated++;
                }

                // --- Tambahan: tulis total (dibulatkan) ke struktur_organisasi.kebutuhan_pegawai ---
                const totalRounded = Math.round(totalKebutuhanPegawai);
                await client.query(
                    `
                        UPDATE struktur_organisasi
                        SET kebutuhan_pegawai = $1,
                            updated_at        = NOW()
                        WHERE id = (SELECT struktur_id FROM jabatan WHERE id = $2::uuid)
                    `,
                    [totalRounded, id]
                );

                await client.query("COMMIT");
                return NextResponse.json({
                    ok: true,
                    message: `Update ABK sukses untuk ${updated} tugas pokok`,
                    jabatan_id: id,
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

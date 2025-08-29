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
        const scriptPath = path.resolve(process.cwd(), 'scripts', 'ekstrakabk.py');
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
                const { tugas_pokok = [] } = item;

                if (!Array.isArray(tugas_pokok) || tugas_pokok.length === 0) {
                    console.warn(`⚠️ Tidak ada tugas_pokok untuk file: ${file.name}`);
                    results.push({ file: file.name, status: 'missing_tugas' });
                    continue;
                }

                const client = await pool.connect();

                try {
                    await client.query('BEGIN');

                    // Ambil data lama berdasarkan id_jabatan
                    const { rows: existing } = await client.query(
                        "SELECT nomor_tugas FROM tugas_pokok WHERE id_jabatan = $1 ORDER BY nomor_tugas ASC",
                        [id_jabatan]
                    );

                    if (existing.length !== tugas_pokok.length) {
                        throw new Error(
                            `Jumlah tugas_pokok di DB (${existing.length}) tidak sama dengan JSON (${tugas_pokok.length})`
                        );
                    }

                    // Update row satu per satu berdasarkan nomor_tugas
                    for (let i = 0; i < tugas_pokok.length; i++) {
                        const tugas = tugas_pokok[i];

                        const jumlah_hasil = tugas.beban_kerja ? parseInt(tugas.beban_kerja) : null;
                        const waktu_penyelesaian_jam = tugas.waktu_penyelesaian ? parseInt(tugas.waktu_penyelesaian) : null;
                        const waktu_efektif = tugas.waktu_kerja_efektif ? parseInt(tugas.waktu_kerja_efektif) : null;
                        const kebutuhan_pegawai = tugas.pegawai_dibutuhkan ? parseFloat(tugas.pegawai_dibutuhkan.replace(",", ".")) : null;

                        await client.query(
                            `UPDATE tugas_pokok 
                 SET jumlah_hasil = $1, 
                     waktu_penyelesaian_jam = $2, 
                     waktu_efektif = $3, 
                     kebutuhan_pegawai = $4,
                     updated_at = NOW()
                 WHERE id_jabatan = $5 AND nomor_tugas = $6`,
                            [jumlah_hasil, waktu_penyelesaian_jam, waktu_efektif, kebutuhan_pegawai, id_jabatan, existing[i].nomor_tugas]
                        );
                    }

                    await client.query('COMMIT');
                    results.push({ file: file.name, status: 'success', id_jabatan });

                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Error update data untuk ${file.name}:`, err);
                    results.push({ file: file.name, status: 'failed', error: String(err) });
                } finally {
                    client.release();
                }

            } catch (jsonError) {
                console.error(`❌ JSON tidak valid dari ${file.name}:`, jsonError);
                results.push({file: file.name, status: 'invalid_json'});
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

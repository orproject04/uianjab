import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];

        if (!files.length) {
            return NextResponse.json({ message: 'Tidak ada file yang dikirim' }, { status: 400 });
        }

        const results = [];

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

                python.stdout.on('data', (data) => {
                    stdoutData += data.toString();
                });

                python.stderr.on('data', (data) => {
                    stderrData += data.toString();
                });

                python.on('close', resolve);
                python.on('error', reject);
            });

            await fs.unlink(tempDocPath);

            if (exitCode !== 0 || !stdoutData) {
                console.error(`❌ Gagal ekstrak ${file.name}:`, stderrData);
                continue;
            }

            try {
                const data = JSON.parse(stdoutData);
                const {
                    nama_jabatan,
                    kode_jabatan,
                    ikhtisar_jabatan,
                    kelas_jabatan,
                    prestasi_yang_diharapkan,
                } = data;

                if (!nama_jabatan || !kode_jabatan) {
                    console.warn(`⚠️ Data tidak lengkap untuk file: ${file.name}`);
                    continue;
                }

                // 🔧 Buat id_jabatan dari nama + timestamp
                const truncatedNama = nama_jabatan.substring(0, 10).replace(/\s+/g, '_').toLowerCase();
                const id_jabatan = `${truncatedNama}_${Date.now()}`;

                const client = await pool.connect();
                try {
                    await client.query(
                        `INSERT INTO jabatan
                         (id_jabatan, nama_jabatan, kode_jabatan, ikhtisar_jabatan, kelas_jabatan, prestasi_diharapkan)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            id_jabatan,
                            nama_jabatan,
                            kode_jabatan,
                            ikhtisar_jabatan,
                            kelas_jabatan,
                            prestasi_yang_diharapkan,
                        ]
                    );
                    results.push({ file: file.name, status: 'success', id_jabatan });
                } catch (insertErr) {
                    console.error(`❌ Gagal insert ke DB:`, insertErr);
                    results.push({ file: file.name, status: 'failed' });
                } finally {
                    client.release();
                }

            } catch (jsonError) {
                console.error(`❌ JSON tidak valid dari ${file.name}:`, jsonError);
                results.push({ file: file.name, status: 'invalid json' });
            }
        }

        return NextResponse.json({
            message: `Proses selesai (${results.filter(r => r.status === 'success').length} sukses)`,
            detail: results,
        });

    } catch (err) {
        console.error('❌ Upload error:', err);
        return NextResponse.json({ message: 'Server error' }, { status: 500 });
    }
}

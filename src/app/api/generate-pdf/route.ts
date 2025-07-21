import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';

const libreOfficePath = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`; // path LibreOffice Anda
const execAsync = promisify(exec);

export async function POST(request: Request) {
    try {
        const data = await request.json();

        const {
            nama_jabatan,
            kode_jabatan,
            unitKerja = {}, // fallback jika tidak ada
        } = data;

        // Mapping untuk menghindari undefined di template
        const {
            jpt_utama = '',
            jpt_madya = '',
            jpt_pratama = '',
            administrator = '',
            pengawas = '',
            pelaksana = '',
            jabatan_fungsional = '',
        } = unitKerja;

        const unitKerjaArr = [
            { key: 'JPT Utama', value: jpt_utama },
            { key: 'JPT Madya', value: jpt_madya },
            { key: 'JPT Pratama', value: jpt_pratama },
            { key: 'Administrator', value: administrator },
            { key: 'Pengawas', value: pengawas },
            { key: 'Pelaksana', value: pelaksana },
            { key: 'Jabatan Fungsional', value: jabatan_fungsional },
        ];

        // Load template docx
        const templatePath = path.join(process.cwd(), 'src', 'templates', 'template.docx');
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        doc.setData({
            nama_jabatan,
            kode_jabatan,
            jpt_utama,
            jpt_madya,
            jpt_pratama,
            administrator,
            pengawas,
            pelaksana,
            jabatan_fungsional,
            unitKerjaArr // if using table or loop in template
        });

        try {
            doc.render();
        } catch (error: any) {
            console.error('Docxtemplater render error:', error);
            return NextResponse.json({ error: error.message, detail: error }, { status: 500 });
        }

        const buffer = doc.getZip().generate({ type: 'nodebuffer' });
        const tempDocxName = `${uuidv4()}.docx`;
        const tempDocxPath = path.join(process.cwd(), 'tmp', tempDocxName);

        if (!fs.existsSync(path.dirname(tempDocxPath))) {
            fs.mkdirSync(path.dirname(tempDocxPath), { recursive: true });
        }

        fs.writeFileSync(tempDocxPath, buffer);

        const outputPdfName = tempDocxName.replace('.docx', '.pdf');
        const outputPdfPath = path.join(process.cwd(), 'tmp', outputPdfName);

        const command = `${libreOfficePath} --headless --convert-to pdf --outdir "${path.dirname(outputPdfPath)}" "${tempDocxPath}"`;

        try {
            await execAsync(command);
        } catch (err: any) {
            console.error('LibreOffice conversion error:', err.stderr || err);
            return NextResponse.json({ error: 'LibreOffice gagal mengonversi file' }, { status: 500 });
        }

        const pdfBuffer = fs.readFileSync(outputPdfPath);

        // Hapus file temp
        fs.unlinkSync(tempDocxPath);
        fs.unlinkSync(outputPdfPath);

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename=document.pdf',
            },
        });

    } catch (error) {
        console.error('Unhandled error:', error);
        return NextResponse.json({ error: 'Gagal generate PDF' }, { status: 500 });
    }
}

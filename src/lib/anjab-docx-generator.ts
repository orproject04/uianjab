import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import * as fs from "fs";
import * as path from "path";

function formatArray(arr: any, emptyValue: string = ""): any[] {
    if (!arr) return emptyValue ? [{ teks: emptyValue }] : [];
    if (typeof arr === 'string') return [{ teks: arr.trim() }];
    if (Array.isArray(arr)) {
        const valid = arr.filter(Boolean);
        if (valid.length === 0) return emptyValue ? [{ teks: emptyValue }] : [];
        if (valid.length === 1) return [{ teks: typeof valid[0] === 'string' ? valid[0].trim() : valid[0] }];
        return valid.map((item, idx) => ({ teks: `${idx + 1}.\t${typeof item === 'string' ? item.trim() : item}` }));
    }
    return emptyValue ? [{ teks: emptyValue }] : [];
}

function formatArraySingle(arr: any, emptyValue: string = ""): any[] {
    if (!arr) return emptyValue ? [{ teks: emptyValue }] : [];
    if (typeof arr === 'string') return [{ teks: arr.trim() }];
    if (Array.isArray(arr)) {
        const valid = arr.filter(Boolean);
        if (valid.length === 0) return emptyValue ? [{ teks: emptyValue }] : [];
        if (valid.length === 1) return [{ teks: typeof valid[0] === 'string' ? valid[0].trim() : valid[0] }];
        return []; // If > 1, handled by formatArrayMulti
    }
    return emptyValue ? [{ teks: emptyValue }] : [];
}

function formatArrayMulti(arr: any): any[] {
    if (!arr || typeof arr === 'string') return [];
    if (Array.isArray(arr)) {
        const valid = arr.filter(Boolean);
        if (valid.length > 1) {
            return valid.map((item, idx) => ({ teks: `${idx + 1}.\t${typeof item === 'string' ? item.trim() : item}` }));
        }
    }
    return [];
}

function formatPendidikanList(arr: any): any[] {
    if (!Array.isArray(arr)) return [{ teks_utama: formatArray(arr)[0]?.teks || "-", sub: [] }];
    const valid = arr.filter(Boolean);
    if (valid.length === 0) return [];
    
    const isSpecial = (item: string) => {
        const lower = item.trim().toLowerCase();
        return lower.startsWith("(diutamakan") || lower.startsWith("(berdasarkan");
    };

    const normalItems = valid.filter(item => !isSpecial(item));

    const hasKalangan = normalItems.some(item => {
        const t = item.trim().toLowerCase();
        return t.startsWith("dari kalangan pns") || t.startsWith("dari kalangan non-pns");
    });

    if (!hasKalangan) {
        if (normalItems.length === 1) {
            return []; // Handled by formatPendidikanSingle
        }
        return normalItems.map((item, idx) => ({ 
            teks_utama: `${idx + 1}.\t${item.trim()}`,
            sub: []
        }));
    }

    const result = [];
    let currentMain: any = null;
    let mainIndex = 1;

    for (let i = 0; i < valid.length; i++) {
        const item = valid[i].trim();
        const lower = item.toLowerCase();
        
        if (isSpecial(item)) {
            // Skip, handled by formatPendidikanDiutamakan
        } else if (lower.startsWith("dari kalangan")) {
            // Cek apakah user sudah menaruh titik dua (:) di datanya atau belum. Jika belum, tambahkan.
            const textWithColon = item.endsWith(":") ? item : `${item}:`;
            currentMain = {
                teks_utama: `${mainIndex}.\t${textWithColon}`,
                sub: []
            };
            result.push(currentMain);
            mainIndex++;
        } else {
            if (currentMain) {
                // Ini adalah sub-bullet.
                currentMain.sub.push({ teks_sub: `-\t${item}` });
            } else {
                // Flat item jika tidak ada main category
                currentMain = {
                    teks_utama: `${mainIndex}.\t${item}`,
                    sub: []
                };
                result.push(currentMain);
                mainIndex++;
            }
        }
    }
    return result;
}

function formatPendidikanSingle(arr: any): any[] {
    if (!Array.isArray(arr)) return [{ teks: formatArray(arr)[0]?.teks || "-" }];
    const valid = arr.filter(Boolean);
    if (valid.length === 0) return [];
    
    const isSpecial = (item: string) => {
        const lower = item.trim().toLowerCase();
        return lower.startsWith("(diutamakan") || lower.startsWith("(berdasarkan");
    };

    const normalItems = valid.filter(item => !isSpecial(item));

    const hasKalangan = normalItems.some(item => {
        const t = item.trim().toLowerCase();
        return t.startsWith("dari kalangan pns") || t.startsWith("dari kalangan non-pns");
    });

    if (!hasKalangan && normalItems.length === 1) {
        return [{ teks: normalItems[0].trim() }];
    }
    return [];
}

function formatPendidikanDiutamakan(arr: any): any[] {
    if (!Array.isArray(arr)) return [];
    const valid = arr.filter(Boolean);
    const specialItems = valid.filter(item => {
        const lower = item.trim().toLowerCase();
        return lower.startsWith("(diutamakan") || lower.startsWith("(berdasarkan");
    });
    return specialItems.map(item => ({ teks: item.trim() }));
}

function formatKondisiFisik(sj: any): string {
    if (!sj) return "-";
    const parts = [
        sj.kondisi_fisik_jenkel ? `Jenis Kelamin: ${sj.kondisi_fisik_jenkel}` : null,
        sj.kondisi_fisik_umur ? `Umur: ${sj.kondisi_fisik_umur}` : null,
        sj.kondisi_fisik_tb ? `Tinggi Badan: ${sj.kondisi_fisik_tb}` : null,
        sj.kondisi_fisik_bb ? `Berat Badan: ${sj.kondisi_fisik_bb}` : null,
        sj.kondisi_fisik_pb ? `Postur Badan: ${sj.kondisi_fisik_pb}` : null,
        sj.kondisi_fisik_tampilan ? `Penampilan: ${sj.kondisi_fisik_tampilan}` : null,
        sj.kondisi_fisik_keadaan ? `Keadaan Fisik: ${sj.kondisi_fisik_keadaan}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : "-";
}

export function generateAnjabDocx(data: any): Buffer {
    const templatePath = path.resolve(process.cwd(), "public", "templates", "anjab.docx");
    
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template Word tidak ditemukan di: ${templatePath}`);
    }

    const content = fs.readFileSync(templatePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const tugasPokokSrc = data.tugas_pokok_abk && data.tugas_pokok_abk.length > 0 
        ? data.tugas_pokok_abk 
        : (data.tugas_pokok || []);

    const renderData = {
        kode_jabatan: data.kode_jabatan || "-",
        nama_jabatan: data.nama_jabatan || "-",
        unit_kerja: data.unit_kerja || "-",
        jpt_utama: data.jpt_utama || "-",
        jpt_madya: data.jpt_madya || "-",
        jpt_pratama: data.jpt_pratama || "-",
        administrator: data.administrator || "-",
        pengawas: data.pengawas || "-",
        pelaksana: data.pelaksana || "-",
        jabatan_fungsional: data.jabatan_fungsional || "-",
        ikhtisar_jabatan: data.ikhtisar_jabatan || "-",
        
        kualifikasi: [{
            pendidikan_single: formatPendidikanSingle(data.pendidikan_formal),
            pendidikan: formatPendidikanList(data.pendidikan_formal),
            pendidikan_diutamakan: formatPendidikanDiutamakan(data.pendidikan_formal),
            diklat_penjenjangan_single: formatArraySingle(data.diklat_penjenjangan),
            diklat_penjenjangan: formatArrayMulti(data.diklat_penjenjangan),
            diklat_teknis_single: formatArraySingle(data.diklat_teknis),
            diklat_teknis: formatArrayMulti(data.diklat_teknis),
            diklat_fungsional_single: formatArraySingle(data.diklat_fungsional, "-"),
            diklat_fungsional: formatArrayMulti(data.diklat_fungsional),
            pengalaman_single: formatPendidikanSingle(data.pengalaman_kerja),
            pengalaman: formatPendidikanList(data.pengalaman_kerja)
        }],

        tugas_pokok: tugasPokokSrc.map((tp: any, i: number) => ({
            no: i + 1,
            uraian: tp.uraian_tugas || "-",
            hasil: formatArray(tp.hasil_kerja),
            waktu: tp.waktu_penyelesaian_jam || "-"
        })),

        bahan_kerja: (data.bahan_kerja || []).map((b: any, i: number) => ({
            no: i + 1,
            bahan: formatArray(b.bahan_kerja),
            penggunaan: formatArray(b.penggunaan_dalam_tugas || b.penggunaan_untuk_tugas)
        })),

        perangkat_kerja: (data.perangkat_kerja || []).map((p: any, i: number) => ({
            no: i + 1,
            perangkat: formatArray(p.perangkat_kerja),
            penggunaan: formatArray(p.penggunaan_untuk_tugas)
        })),

        tanggung_jawab: (data.tanggung_jawab || []).map((t: any, i: number) => ({
            no: i + 1,
            uraian: t.uraian_tanggung_jawab || "-"
        })),

        wewenang: (data.wewenang || []).map((w: any, i: number) => ({
            no: i + 1,
            uraian: w.uraian_wewenang || "-"
        })),

        korelasi: (data.korelasi_jabatan || []).map((k: any, i: number) => ({
            no: i + 1,
            nama_jabatan: formatArray(k.jabatan_terkait),
            unit_kerja: formatArray(k.unit_kerja_instansi),
            dalam_hal: formatArray(k.dalam_hal)
        })),

        kondisi: (data.kondisi_lingkungan_kerja || []).map((k: any, i: number) => ({
            no: i + 1,
            aspek: k.aspek || "-",
            faktor: k.faktor || "-"
        })),

        risiko: (data.risiko_bahaya || []).map((r: any, i: number) => ({
            no: i + 1,
            nama_risiko: r.nama_risiko || "-",
            penyebab: r.penyebab || "-"
        })),

        syarat_jabatan: data.syarat_jabatan ? [{
            keterampilan: formatArray(data.syarat_jabatan.keterampilan_kerja),
            bakat: formatArray(data.syarat_jabatan.bakat_kerja),
            temperamen: formatArray(data.syarat_jabatan.temperamen_kerja),
            minat: formatArray(data.syarat_jabatan.minat_kerja),
            upaya_fisik: formatArray(data.syarat_jabatan.upaya_fisik),
            kondisi_fisik: formatKondisiFisik(data.syarat_jabatan),
            fungsi_pekerja: formatArray(data.syarat_jabatan.fungsi_pekerja)
        }] : []
    };

    doc.render(renderData);

    return doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });
}

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { getAnjabByIdOrSlug } from "@/lib/anjab-queries";
import { buildAnjabDocxData } from "@/lib/anjab-docx-generator";
import { getDownloadGroups } from "@/lib/download-groups";
import archiver from "archiver";
import fs from "fs";
import * as os from "os";
import * as path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { convertDocxBufferToPdfBuffer } from "@/lib/pdf-converter";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

interface PetaJabatanWithABK {
    peta_id: string;
    jabatan_id: string;
    nama_jabatan: string;
    jenis_jabatan: string;
    unit_kerja: string;
    level: number;
    parent_id: string | null;
    parent_nama: string | null;
    parent_jenis: string | null;
    has_abk: boolean;
    is_pusat: boolean;
}

function getDFSItems(
    allPetaJabatan: PetaJabatanWithABK[],
    rootNodeNameMatcher: string
): PetaJabatanWithABK[] {
    const childrenMap = new Map<string | null, PetaJabatanWithABK[]>();
    for (const item of allPetaJabatan) {
        const parentId = item.parent_id || null;
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(item);
    }

    const result: PetaJabatanWithABK[] = [];

    function traverse(nodeId: string | null) {
        const children = childrenMap.get(nodeId) || [];
        for (const child of children) {
            result.push(child);
            traverse(child.peta_id);
        }
    }

    const rootNodes = allPetaJabatan.filter(p => p.nama_jabatan?.toLowerCase().includes(rootNodeNameMatcher));
    for (const root of rootNodes) {
        result.push(root);

        let rootChildren = childrenMap.get(root.peta_id) || [];

        const deputiAdm = rootChildren.find(c => (c.nama_jabatan || "").toLowerCase().includes("deputi bidang administrasi"));
        const deputiPersidangan = rootChildren.find(c => (c.nama_jabatan || "").toLowerCase().includes("deputi bidang persidangan"));

        const groupA: PetaJabatanWithABK[] = [];
        if (deputiAdm) groupA.push(deputiAdm);
        if (deputiPersidangan) groupA.push(deputiPersidangan);

        const groupB = rootChildren.filter(c =>
            !(c.nama_jabatan || "").toLowerCase().includes("deputi bidang administrasi") &&
            !(c.nama_jabatan || "").toLowerCase().includes("deputi bidang persidangan")
        );

        for (const child of groupA) {
            result.push(child);
        }

        for (const child of groupA) {
            traverse(child.peta_id);
        }

        for (const child of groupB) {
            result.push(child);
            traverse(child.peta_id);
        }
    }

    return result;
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const streamMode = url.searchParams.get("stream") === "1";
        const scope = url.searchParams.get("scope") || "all";
        const fileParam = url.searchParams.get("file");

        if (fileParam) {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const filePath = path.join(os.tmpdir(), fileParam);
            if (!fs.existsSync(filePath)) {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }

            const fileSize = fs.statSync(filePath).size;
            const nodeStream = fs.createReadStream(filePath);
            const webStream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of nodeStream) {
                            controller.enqueue(new Uint8Array(chunk));
                        }
                        controller.close();
                    } catch (err) {
                        controller.error(err);
                    } finally {
                        try {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (e) { }
                    }
                },
                cancel() {
                    nodeStream.destroy();
                }
            });

            return new NextResponse(webStream, {
                status: 200,
                headers: {
                    "Content-Type": "application/vnd.ms-word; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${fileParam}"`,
                    "Content-Length": fileSize.toString(),
                    "Cache-Control": "no-cache",
                },
            });
        }

        const user = getUserFromReq(req);
        if (!user || !hasRole(user, "admin")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (streamMode) {
            const encoder = new TextEncoder();
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        const result = await pool.query(`SELECT
                                pj.id as peta_id,
                                pj.jabatan_id,
                                pj.nama_jabatan,
                                pj.jenis_jabatan,
                                pj.unit_kerja,
                                pj.level,
                                pj.parent_id,
                                pj.is_pusat,
                                pp.nama_jabatan as parent_nama,
                                pp.jenis_jabatan as parent_jenis,
                                EXISTS(SELECT 1 FROM tugas_pokok_abk tpa WHERE tpa.peta_jabatan_id = pj.id) as has_abk
                            FROM peta_jabatan pj
                            LEFT JOIN peta_jabatan pp ON pp.id = pj.parent_id
                            ORDER BY pj.level, pj.order_index, pj.nama_jabatan
                        `);

                        const allPetaJabatan: PetaJabatanWithABK[] = result.rows;
                        let dfsList: PetaJabatanWithABK[] = [];
                        let groups = getDownloadGroups(allPetaJabatan);
                        let isGroupMode = false;

                        if (scope === "tree" || scope === "all") {
                            for (const g of groups) {
                                dfsList.push(...g.nodes);
                            }
                        } else if (scope === "groups") {
                            isGroupMode = true;
                            for (const g of groups) {
                                dfsList.push(...g.nodes);
                            }
                        }

                        if (dfsList.length === 0) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Tidak ada anjab dengan ABK yang ditemukan" })}\n\n`));
                            controller.close();
                            return;
                        }

                        const total = dfsList.length;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ total })}\n\n`));

                        let successCount = 0;

                        const archiveFileName = `Seluruh_Anjab_PDF_${timestamp}.zip`;
                        const archivePath = path.join(os.tmpdir(), archiveFileName);
                        const output = fs.createWriteStream(archivePath);
                        const archive = archiver('zip', { zlib: { level: 5 } });

                        archive.on('error', (err: any) => { throw err; });
                        archive.pipe(output);

                        if (isGroupMode) {
                            for (let gIdx = 0; gIdx < groups.length; gIdx++) {
                                const group = groups[gIdx];
                                if (group.nodes.length === 0) continue;

                                const prefix = String(gIdx + 1).padStart(2, '0');
                                const safeName = group.name.replace(/[^a-zA-Z0-9 -]/g, "").trim();
                                const groupFileName = `${prefix} - ${safeName}.docx`;
                                
                                const anjabList: any[] = [];

                                for (let i = 0; i < group.nodes.length; i++) {
                                    const item = group.nodes[i];
                                    try {
                                        const data = await getAnjabByIdOrSlug(item.peta_id);
                                        if (data) {
                                            const renderedData = buildAnjabDocxData(data);
                                            anjabList.push(renderedData);
                                        }
                                        successCount++;
                                    } catch (error) {
                                        console.error(`Error building docx for ${item.nama_jabatan}:`, error);
                                    }
                                    const progress = { done: successCount, total };
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
                                }
                                
                                if (anjabList.length > 0) {
                                    for (let i = 0; i < anjabList.length - 1; i++) {
                                        anjabList[i].pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
                                    }
                                    anjabList[anjabList.length - 1].pageBreak = '';

                                    const templatePath = path.resolve(process.cwd(), "public", "templates", "anjab.docx");
                                    const content = fs.readFileSync(templatePath, "binary");
                                    const zip = new PizZip(content);
                                    
                                    let xml = zip.file('word/document.xml').asText();
                                    const startTag = '<w:p><w:r><w:t>{#anjabList}</w:t></w:r></w:p>';
                                    const endTag = '<w:p><w:r><w:t>{@pageBreak}</w:t></w:r></w:p><w:p><w:r><w:t>{/anjabList}</w:t></w:r></w:p>';
                                    const bodyStart = xml.indexOf('<w:body>') + 8;
                                    const sectPrIndex = xml.lastIndexOf('<w:sectPr');
                                    
                                    xml = xml.slice(0, bodyStart) + startTag + xml.slice(bodyStart, sectPrIndex) + endTag + xml.slice(sectPrIndex);
                                    zip.file('word/document.xml', xml);
                                    
                                    const doc = new Docxtemplater(zip, {
                                        paragraphLoop: true,
                                        linebreaks: true,
                                    });
                                    
                                    doc.render({ anjabList });
                                    const mergedBuffer = doc.getZip().generate({
                                        type: "nodebuffer",
                                        compression: "DEFLATE",
                                    });
                                    
                                    // Send ping every 5 seconds while LibreOffice is converting to prevent timeout
                                    const pingInterval = setInterval(() => {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ping: true, message: "Sedang mengonversi ke PDF..." })}\n\n`));
                                    }, 5000);
                                    
                                    try {
                                        const pdfBuffer = await convertDocxBufferToPdfBuffer(mergedBuffer, `group-${safeName}`);
                                        archive.append(pdfBuffer, { name: groupFileName.replace('.docx', '.pdf') });
                                    } finally {
                                        clearInterval(pingInterval);
                                    }
                                }
                            }
                        } else {
                            const anjabList: any[] = [];
                            for (let i = 0; i < total; i++) {
                                const item = dfsList[i];
                                try {
                                    const data = await getAnjabByIdOrSlug(item.peta_id);
                                    if (data) {
                                        const renderedData = buildAnjabDocxData(data);
                                        anjabList.push(renderedData);
                                    }
                                    successCount++;
                                } catch (error) {
                                    console.error(`Error building docx for ${item.nama_jabatan}:`, error);
                                }
                                const progress = { done: successCount, total };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
                            }
                            
                            if (anjabList.length > 0) {
                                for (let i = 0; i < anjabList.length - 1; i++) {
                                    anjabList[i].pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
                                }
                                anjabList[anjabList.length - 1].pageBreak = '';

                                const templatePath = path.resolve(process.cwd(), "public", "templates", "anjab.docx");
                                const content = fs.readFileSync(templatePath, "binary");
                                const zip = new PizZip(content);
                                
                                let xml = zip.file('word/document.xml').asText();
                                const startTag = '<w:p><w:r><w:t>{#anjabList}</w:t></w:r></w:p>';
                                const endTag = '<w:p><w:r><w:t>{@pageBreak}</w:t></w:r></w:p><w:p><w:r><w:t>{/anjabList}</w:t></w:r></w:p>';
                                const bodyStart = xml.indexOf('<w:body>') + 8;
                                const sectPrIndex = xml.lastIndexOf('<w:sectPr');
                                
                                xml = xml.slice(0, bodyStart) + startTag + xml.slice(bodyStart, sectPrIndex) + endTag + xml.slice(sectPrIndex);
                                zip.file('word/document.xml', xml);
                                
                                const doc = new Docxtemplater(zip, {
                                    paragraphLoop: true,
                                    linebreaks: true,
                                });
                                
                                doc.render({ anjabList });
                                const mergedBuffer = doc.getZip().generate({
                                    type: "nodebuffer",
                                    compression: "DEFLATE",
                                });
                                
                                const pingInterval = setInterval(() => {
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ping: true, message: "Sedang mengonversi ke PDF..." })}\n\n`));
                                }, 5000);
                                
                                try {
                                    const pdfBuffer = await convertDocxBufferToPdfBuffer(mergedBuffer, "all-anjab");
                                    archive.append(pdfBuffer, { name: "Semua_Anjab.pdf" });
                                } finally {
                                    clearInterval(pingInterval);
                                }
                            }
                        }

                        // Wait for ZIP to finish generating
                        await archive.finalize();

                        // Send complete signal with the zip file name
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, file: archiveFileName })}\n\n`));
                        controller.close();
                    } catch (err: any) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message || 'unknown' })}\n\n`));
                        controller.close();
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });
        }

        return NextResponse.json({ error: "Mode streaming diwajibkan" }, { status: 400 });
    } catch (err: any) {
        console.error("[anjab/download-bulk-docx][GET] error:", err);
        return NextResponse.json({ error: err.message || "General Error" }, { status: 500 });
    }
}

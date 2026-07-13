import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";
import { getAnjabByIdOrSlug } from "@/lib/anjab-queries";
import { buildAnjabHtml } from "@/lib/anjab-pdf-template";
import { getDownloadGroups } from "@/lib/download-groups";
import archiver from "archiver";
import fs from "fs";
import * as os from "os";
import * as path from "path";

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
                        const wordMetaStart = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<style>
    @page Section1 { size: 595.3pt 841.9pt; margin: 2cm 2.5cm 2.38cm 2.3cm; mso-page-orientation: portrait; }
    @page Section2 { size: 841.9pt 595.3pt; margin: 1.2cm 1.2cm 1.2cm 1.2cm; mso-page-orientation: landscape; }
    div.Section1 { page: Section1; }
    div.Section2 { page: Section2; }
    table.word-table { page-break-inside: auto; width: 100%; border-collapse: collapse; mso-table-layout-alt: fixed; margin: 6px 0 30px 0; table-layout: auto; font-size: 11pt; border: .5pt solid windowtext; }
    table.word-table th, table.word-table td { border: .5pt solid windowtext; padding: 6px; vertical-align: top; word-break: normal; white-space: normal; }
    table.word-table th { font-weight: normal; vertical-align: middle; text-align: center; background: #C3C3C3; }
    html, body { height: 100%; }
    body { font-family: "Tahoma", Times, serif; font-size: 11pt; line-height: 1.35; color: #000; margin: 0; -webkit-font-smoothing: antialiased; }
    .doc-title { text-align: center; margin-bottom: 19px; }
    .table-section p { page-break-after: avoid; margin: 0; padding: 0; }
    .table-section table { margin: 0; padding: 0; }
    .word-table { page-break-inside: auto; border-collapse: collapse; }
    .word-table thead { display: table-header-group; }
    .word-table tbody { display: table-row-group; }
    .word-table tr { page-break-inside: avoid; page-break-after: auto; }
    .word-table td, .word-table th { page-break-inside: avoid; }
    .section { margin-top: 5px; margin-bottom: 20px; }
    .section .title { font-weight: bold; display: block; margin-bottom: 4px; }
    p { margin: 4px 0; text-align: justify; }
    .key-value { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    .key-value td { vertical-align: top; padding: 4px 6px; }
    .key-value td.custom-padding { padding-top: 0; padding-bottom: 0; }
    .kv-left { width: 33%; } .kv-sep { width: 7%; } .kv-right { width: 60%; }
    ol.alpha { list-style-type: lower-alpha; margin: 0 0 0 1.2em; padding: 0; }
    ol.num   { list-style-type: decimal;      margin: 0 0 0 1.2em; padding: 0; }
    ul.simple{ margin: 0 0 0 1.2em; padding: 0; list-style-type: disc; }
    .small { font-size: 10pt; }
    .page-break { page-break-before: always; }
    .keep-together { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="Section1">`;

                        const wordMetaEnd = `</div></body></html>`;

                        if (isGroupMode) {
                            const archiveFileName = `Seluruh_Anjab_Word_${timestamp}.zip`;
                            const archivePath = path.join(os.tmpdir(), archiveFileName);
                            const output = fs.createWriteStream(archivePath);
                            const archive = archiver('zip', { zlib: { level: 5 } });

                            archive.on('error', (err: any) => { throw err; });
                            archive.pipe(output);

                            for (let gIdx = 0; gIdx < groups.length; gIdx++) {
                                const group = groups[gIdx];
                                if (group.nodes.length === 0) continue;

                                let combinedHtml = "";
                                for (let i = 0; i < group.nodes.length; i++) {
                                    const item = group.nodes[i];
                                    try {
                                        const data = await getAnjabByIdOrSlug(item.peta_id);
                                        if (data) {
                                            const bodyHtml = buildAnjabHtml(data, { isWord: true, bodyOnly: true });
                                            if (combinedHtml !== "") {
                                                combinedHtml += `\n<br clear="all" style="page-break-before:always; mso-break-type:section-break" />\n`;
                                            }
                                            combinedHtml += bodyHtml;
                                        }
                                        successCount++;
                                    } catch (error) {
                                        console.error(`Error building html for ${item.nama_jabatan}:`, error);
                                    }
                                    const progress = { done: successCount, total };
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
                                }

                                const finalWordContent = wordMetaStart + combinedHtml + wordMetaEnd;
                                const prefix = String(gIdx + 1).padStart(2, '0');
                                const safeName = group.name.replace(/[^a-zA-Z0-9 -]/g, "").trim();
                                archive.append(Buffer.from(finalWordContent, 'utf-8'), { name: `${prefix} - ${safeName}.doc` });
                            }

                            await archive.finalize();

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, file: archiveFileName })}\n\n`));
                            controller.close();
                            return;
                        } else {
                            // Old combined logic
                            let combinedHtml = "";
                            for (let i = 0; i < total; i++) {
                                const item = dfsList[i];
                                try {
                                    const data = await getAnjabByIdOrSlug(item.peta_id);
                                    if (data) {
                                        const bodyHtml = buildAnjabHtml(data, { isWord: true, bodyOnly: true });

                                        if (combinedHtml !== "") {
                                            combinedHtml += `\n<br clear="all" style="page-break-before:always; mso-break-type:section-break" />\n`;
                                        }
                                        combinedHtml += bodyHtml;
                                    }
                                    successCount++;
                                } catch (error) {
                                    console.error(`Error building html for ${item.nama_jabatan}:`, error);
                                }
                                const progress = { done: successCount, total };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
                            }


                            const wordMeta = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<style>
    @page Section1 { size: 595.3pt 841.9pt; margin: 2cm 2.5cm 2.38cm 2.3cm; mso-page-orientation: portrait; }
    @page Section2 { size: 841.9pt 595.3pt; margin: 1.2cm 1.2cm 1.2cm 1.2cm; mso-page-orientation: landscape; }
    div.Section1 { page: Section1; }
    div.Section2 { page: Section2; }
    table.word-table { page-break-inside: auto; width: 100%; border-collapse: collapse; mso-table-layout-alt: fixed; margin: 6px 0 30px 0; table-layout: auto; font-size: 11pt; border: .5pt solid windowtext; }
    table.word-table th, table.word-table td { border: .5pt solid windowtext; padding: 6px; vertical-align: top; word-break: normal; white-space: normal; }
    table.word-table th { font-weight: normal; vertical-align: middle; text-align: center; background: #C3C3C3; }
    html, body { height: 100%; }
    body { font-family: "Tahoma", Times, serif; font-size: 11pt; line-height: 1.35; color: #000; margin: 0; -webkit-font-smoothing: antialiased; }
    .doc-title { text-align: center; margin-bottom: 19px; }
    .table-section p { page-break-after: avoid; margin: 0; padding: 0; }
    .table-section table { margin: 0; padding: 0; }
    .word-table { page-break-inside: auto; border-collapse: collapse; }
    .word-table thead { display: table-header-group; }
    .word-table tbody { display: table-row-group; }
    .word-table tr { page-break-inside: avoid; page-break-after: auto; }
    .word-table td, .word-table th { page-break-inside: avoid; }
    .section { margin-top: 5px; margin-bottom: 20px; }
    .section .title { font-weight: bold; display: block; margin-bottom: 4px; }
    p { margin: 4px 0; text-align: justify; }
    .key-value { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
    .key-value td { vertical-align: top; padding: 4px 6px; }
    .key-value td.custom-padding { padding-top: 0; padding-bottom: 0; }
    .kv-left { width: 33%; } .kv-sep { width: 7%; } .kv-right { width: 60%; }
    ol.alpha { list-style-type: lower-alpha; margin: 0 0 0 1.2em; padding: 0; }
    ol.num   { list-style-type: decimal;      margin: 0 0 0 1.2em; padding: 0; }
    ul.simple{ margin: 0 0 0 1.2em; padding: 0; list-style-type: disc; }
    .small { font-size: 10pt; }
    .page-break { page-break-before: always; }
    .center { text-align: center; }
    .two-col { display: flex; gap: 12px; } .two-col > div { flex: 1; }
    .custom-justify { text-align: justify; } .custom-justify:after { content: ""; width: 100%; }
</style>
</head>
<body>
`;
                            const safeHtml = wordMeta + combinedHtml + "\n</body>\n</html>";
                            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
                            const fileName = `Anjab_Gabungan_${timestamp}.doc`;

                            const fs = require('fs');
                            const path = require('path');
                            const os = require('os');
                            const filePath = path.join(os.tmpdir(), fileName);
                            fs.writeFileSync(filePath, safeHtml);

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, file: fileName })}\n\n`));
                            controller.close();
                        } // Closing brace for the 'else' block
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

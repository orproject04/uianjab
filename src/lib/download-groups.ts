import { PetaJabatanWithABK } from "@/app/api/anjab/download-bulk/route";

export interface DownloadGroup {
    id: string;
    name: string;
    nodes: any[];
}

export function getDownloadGroups(allPetaJabatan: any[]): DownloadGroup[] {
    const childrenMap = new Map<string | null, any[]>();
    for (const item of allPetaJabatan) {
        const parentId = item.parent_id || null;
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(item);
    }

    // 1. Find Root (Setjen)
    const rootNodes = allPetaJabatan.filter(p => p.nama_jabatan?.toLowerCase().includes("sekretaris jenderal dpd ri"));
    
    if (rootNodes.length === 0) return [];
    
    const setjen = rootNodes[0];
    const rootChildren = childrenMap.get(setjen.peta_id) || [];
    
    // Group A: Deputi
    const deputiAdm = rootChildren.find(c => (c.nama_jabatan || "").toLowerCase().includes("deputi bidang administrasi"));
    const deputiPersidangan = rootChildren.find(c => (c.nama_jabatan || "").toLowerCase().includes("deputi bidang persidangan"));
    
    const eselon1Nodes: any[] = [setjen];
    if (deputiAdm) eselon1Nodes.push(deputiAdm);
    if (deputiPersidangan) eselon1Nodes.push(deputiPersidangan);

    const groups: DownloadGroup[] = [];
    
    // Group 1: Eselon 1
    groups.push({
        id: "eselon1",
        name: "Eselon I",
        nodes: eselon1Nodes.filter(p => !!p.jabatan_id && (p.jenis_jabatan === "JABATAN FUNGSIONAL" || p.has_abk))
    });

    // Helper for DFS
    function getSubtree(nodeId: string): any[] {
        const result: any[] = [];
        function traverse(currId: string) {
            const children = childrenMap.get(currId) || [];
            for (const child of children) {
                result.push(child);
                traverse(child.peta_id);
            }
        }
        traverse(nodeId);
        return result;
    }

    // Eselon 2 nodes are:
    // 1. Children of Deputi Adm
    // 2. Children of Deputi Persidangan
    // 3. Other children of Setjen
    const eselon2Roots: any[] = [];
    
    if (deputiAdm) {
        eselon2Roots.push(...(childrenMap.get(deputiAdm.peta_id) || []));
    }
    if (deputiPersidangan) {
        eselon2Roots.push(...(childrenMap.get(deputiPersidangan.peta_id) || []));
    }
    
    const otherSetjenChildren = rootChildren.filter(c => 
        !(c.nama_jabatan || "").toLowerCase().includes("deputi bidang administrasi") && 
        !(c.nama_jabatan || "").toLowerCase().includes("deputi bidang persidangan")
    );
    eselon2Roots.push(...otherSetjenChildren);

    // For each Eselon 2 root, form a group
    for (const e2 of eselon2Roots) {
        const nodesInGroup = [e2, ...getSubtree(e2.peta_id)];
        const filteredNodes = nodesInGroup.filter(p => !!p.jabatan_id && (p.jenis_jabatan === "JABATAN FUNGSIONAL" || p.has_abk));
        
        if (filteredNodes.length > 0) {
            groups.push({
                id: e2.peta_id,
                name: e2.unit_kerja || e2.nama_jabatan || "Tanpa Nama",
                nodes: filteredNodes
            });
        }
    }

    return groups;
}

import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

// Improved similarity function with proper token matching
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Tokenize and normalize
    const tokens1 = s1.split(/\s+/).filter(t => t.length > 0);
    const tokens2 = s2.split(/\s+/).filter(t => t.length > 0);
    
    // If length difference is too large, penalize heavily
    const lengthDiff = Math.abs(tokens1.length - tokens2.length);
    const maxLen = Math.max(tokens1.length, tokens2.length);
    const lengthPenalty = lengthDiff / maxLen;
    
    // Track which tokens from str2 have been matched
    const matched2 = new Set<number>();
    let exactMatches = 0;
    let partialMatches = 0;
    
    // First pass: find exact matches (case-insensitive)
    for (let i = 0; i < tokens1.length; i++) {
        for (let j = 0; j < tokens2.length; j++) {
            if (matched2.has(j)) continue;
            if (tokens1[i] === tokens2[j]) {
                exactMatches++;
                matched2.add(j);
                break;
            }
        }
    }
    
    // Second pass: find partial matches for remaining unmatched tokens
    // But be strict: only match if one is a significant substring of the other
    for (let i = 0; i < tokens1.length; i++) {
        let alreadyMatched = false;
        for (let j = 0; j < tokens2.length; j++) {
            if (matched2.has(j) && tokens1[i] === tokens2[j]) {
                alreadyMatched = true;
                break;
            }
        }
        if (alreadyMatched) continue;
        
        for (let j = 0; j < tokens2.length; j++) {
            if (matched2.has(j)) continue;
            
            const t1 = tokens1[i];
            const t2 = tokens2[j];
            
            // Only consider significant partial match if length is at least 4 chars
            // and one is contained in the other
            if (t1.length >= 4 && t2.length >= 4) {
                if (t1.includes(t2) || t2.includes(t1)) {
                    partialMatches++;
                    matched2.add(j);
                    break;
                }
            }
        }
    }
    
    // Calculate weighted score
    // Exact matches worth full, partial matches worth 0.5
    const totalMatchedScore = exactMatches + (partialMatches * 0.5);
    const baseSimilarity = (2.0 * totalMatchedScore) / (tokens1.length + tokens2.length);
    
    // Apply length penalty (reduce score if lengths differ significantly)
    const finalScore = baseSimilarity * (1 - lengthPenalty * 0.3);
    
    return Math.max(0, Math.min(1, finalScore));
}

export async function POST(req: NextRequest) {
    try {
        const user = getUserFromReq(req);
        if (!user || !hasRole(user, ["admin"])) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { peta_jabatan, master_anjab } = body;

        const suggestions: any[] = [];

        // For each peta jabatan, find best matching master anjab
        for (const peta of peta_jabatan) {
            let bestMatch = null;
            let bestSimilarity = 0;

            for (const anjab of master_anjab) {
                const similarity = calculateSimilarity(peta.nama, anjab.nama);
                
                if (similarity > bestSimilarity && similarity > 0.5) {
                    bestSimilarity = similarity;
                    bestMatch = anjab;
                }
            }

            if (bestMatch) {
                suggestions.push({
                    peta_id: peta.id,
                    peta_nama: peta.nama,
                    versi_id: peta.versi_id,
                    nama_versi: peta.nama_versi,
                    anjab_id: bestMatch.id,
                    anjab_nama: bestMatch.nama,
                    similarity: bestSimilarity,
                });
            }
        }

        // Sort by similarity (highest first)
        suggestions.sort((a, b) => b.similarity - a.similarity);

        return NextResponse.json({ suggestions });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Gagal generate suggestions" },
            { status: 500 }
        );
    }
}

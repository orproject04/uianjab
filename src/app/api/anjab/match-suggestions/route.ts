import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUserFromReq, hasRole } from "@/lib/auth";

// Simple similarity function using trigram
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    // Tokenize and compare
    const tokens1 = s1.split(/\s+/);
    const tokens2 = s2.split(/\s+/);
    
    let matchCount = 0;
    const maxTokens = Math.max(tokens1.length, tokens2.length);
    
    for (const t1 of tokens1) {
        for (const t2 of tokens2) {
            if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) {
                matchCount++;
                break;
            }
        }
    }
    
    return matchCount / maxTokens;
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
        console.error("Error generating suggestions:", error);
        return NextResponse.json(
            { error: error?.message || "Gagal generate suggestions" },
            { status: 500 }
        );
    }
}

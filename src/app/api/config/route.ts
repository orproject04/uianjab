// src/app/api/config/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        externalPegawaiApiUrl: process.env.EXTERNAL_PAGE_PEGAWAI_API_URL,
        externalApiPerPage: parseInt(process.env.EXTERNAL_API_PER_PAGE || '100'),
    });
}

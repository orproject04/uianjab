// src/app/api/config/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        externalPegawaiApiUrl: process.env.EXTERNAL_PAGE_PEGAWAI_API_URL,
        externalApiPerPage: parseInt(process.env.EXTERNAL_API_PER_PAGE || '100'),
        externalSkApiUrlList: process.env.EXTERNAL_SK_API_URL_LIST || 'https://okk.dpd.go.id/dpd-portal/openapi/talenta/list',
        externalSkApiUrlProfil: process.env.EXTERNAL_SK_API_URL_PROFIL || 'https://okk.dpd.go.id/dpd-portal/openapi/profil',
    });
}

// src/app/api/upload-json/route.ts
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { items } = body

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { message: 'Data kosong atau tidak valid' },
                { status: 400 }
            )
        }

        const insertQuery = `
      INSERT INTO anjab (nama_jabatan, unit_kerja)
      VALUES ($1, $2)
    `

        for (const item of items) {
            const jabatan = item['NAMA JABATAN']
            const unitKerja = item['UNIT KERJA']

            if (!jabatan || typeof unitKerja !== 'object') continue

            await pool.query(insertQuery, [
                jabatan,
                JSON.stringify(unitKerja),
            ])
        }

        return NextResponse.json({ message: 'Semua data berhasil disimpan' })
    } catch (err) {
        console.error(err)
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        )
    }
}

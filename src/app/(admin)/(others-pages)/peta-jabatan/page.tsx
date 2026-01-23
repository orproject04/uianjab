import React from 'react';
import type { Metadata } from 'next';
import PetaJabatanWrapper from './PetaJabatanWrapper';

export const dynamic = 'force-dynamic'; // prevent static pre-render that may cause build errors
export const revalidate = 0;            // no caching

export const metadata: Metadata = {
    title: 'Peta Jabatan',
    description: 'Visualisasi Peta Jabatan dan Struktur Organisasi',
};

export default function Page() {
    return <PetaJabatanWrapper />;
}

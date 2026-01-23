'use client';

import React, { Suspense, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import both components to avoid SSR issues with d3
const PetaJabatanClient = dynamic(
    () => import('./PetaJabatanClient'),
    { ssr: false, loading: () => <LoadingSpinner message="Memuat Peta Jabatan..." /> }
);

const StrukturOrganisasiClient = dynamic(
    () => import('./StrukturOrganisasiClient'),
    { ssr: false, loading: () => <LoadingSpinner message="Memuat Struktur Organisasi..." /> }
);

// Loading spinner component
function LoadingSpinner({ message }: { message: string }) {
    return (
        <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center space-y-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
                <p className="text-sm text-gray-600">{message}</p>
            </div>
        </div>
    );
}

type ViewMode = 'peta-jabatan' | 'struktur-organisasi';

export default function PetaJabatanWrapper() {
    const [viewMode, setViewMode] = useState<ViewMode>('peta-jabatan');

    // Restore view mode from sessionStorage
    useEffect(() => {
        const savedMode = sessionStorage.getItem('petaJabatan_viewMode');
        if (savedMode === 'peta-jabatan' || savedMode === 'struktur-organisasi') {
            setViewMode(savedMode);
        }
    }, []);

    // Save view mode to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('petaJabatan_viewMode', viewMode);
    }, [viewMode]);

    return (
        <div className="flex flex-col">
            {/* Tab Navigation */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="px-4 sm:px-6">
                    <nav className="flex space-x-1" aria-label="Tabs">
                        <button
                            onClick={() => setViewMode('peta-jabatan')}
                            className={`
                relative py-4 px-6 text-sm font-medium transition-all duration-200
                ${viewMode === 'peta-jabatan'
                                    ? 'text-brand-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                }
              `}
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                                    />
                                </svg>
                                Peta Jabatan
                            </span>
                            {/* Active indicator */}
                            {viewMode === 'peta-jabatan' && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t-full" />
                            )}
                        </button>

                        <button
                            onClick={() => setViewMode('struktur-organisasi')}
                            className={`
                relative py-4 px-6 text-sm font-medium transition-all duration-200
                ${viewMode === 'struktur-organisasi'
                                    ? 'text-brand-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                }
              `}
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                    />
                                </svg>
                                Struktur Organisasi
                            </span>
                            {/* Active indicator */}
                            {viewMode === 'struktur-organisasi' && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t-full" />
                            )}
                        </button>
                    </nav>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1">
                <Suspense fallback={<LoadingSpinner message="Memuat..." />}>
                    {viewMode === 'peta-jabatan' ? (
                        <PetaJabatanClient />
                    ) : (
                        <StrukturOrganisasiClient />
                    )}
                </Suspense>
            </div>
        </div>
    );
}

"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/apiFetch";

export interface Versi {
    id: string;
    nama_versi: string;
    status: string;
    keterangan: string;
}

interface SotkContextType {
    activeVersion: string;
    setActiveVersion: (v: string) => void;
    versions: Versi[];
    setVersions: React.Dispatch<React.SetStateAction<Versi[]>>;
    loadingVersions: boolean;
    fetchVersions: () => Promise<void>;
}

const SotkContext = createContext<SotkContextType | undefined>(undefined);

export const SotkProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const [activeVersion, setActiveVersion] = useState("AKTIF");
    const [versions, setVersions] = useState<Versi[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);

    const fetchVersions = useCallback(async () => {
        setLoadingVersions(true);
        try {
            const res = await apiFetch("/api/peta-jabatan/versi", { cache: "no-store" });
            if (res.ok) {
                const json = await res.json();
                const list: Versi[] = json.data || [];
                setVersions(list);
                const currentActive = list.find((v) => v.status === 'AKTIF');
                if (currentActive && (activeVersion === 'AKTIF' || !activeVersion)) {
                    setActiveVersion(currentActive.id);
                }
            }
        } catch (e) {
            console.error("Gagal memuat versi:", e);
        } finally {
            setLoadingVersions(false);
        }
    }, [activeVersion]);

    useEffect(() => {
        fetchVersions();
    }, []);

    return (
        <SotkContext.Provider value={{
            activeVersion, 
            setActiveVersion, 
            versions, 
            setVersions, 
            loadingVersions, 
            fetchVersions
        }}>
            {children}
        </SotkContext.Provider>
    );
};

export const useSotk = () => {
    const context = useContext(SotkContext);
    if (!context) throw new Error("useSotk must be used within SotkProvider");
    return context;
};


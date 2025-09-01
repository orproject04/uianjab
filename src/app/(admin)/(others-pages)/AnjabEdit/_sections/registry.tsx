import JabatanForm from "./jabatan";
import UnitKerjaForm from "@/app/(admin)/(others-pages)/AnjabEdit/_sections/unit-kerja";
import KualifikasiForm from "@/app/(admin)/(others-pages)/AnjabEdit/_sections/kualifikasi";
import TugasPokokForm from "./tugas-pokok";
import HasilKerjaForm from "@/app/(admin)/(others-pages)/AnjabEdit/_sections/hasil-kerja";
// import UnitKerjaForm from "./unit-kerja";

// Stub untuk sementara
function Stub({id}: { id: string; viewerPath: string }) {
    return (
        <div className="p-4 border rounded bg-gray-50">
            <p>Form untuk section ini belum diisi. ID: <strong>{id}</strong></p>
        </div>
    );
}

export const SECTION_COMPONENTS = {
    "jabatan": JabatanForm,
    "unit-kerja": UnitKerjaForm,
    "kualifikasi": KualifikasiForm,
    "tugas-pokok": TugasPokokForm,
    // "tahapan-uraian-tugas": Stub,
    "hasil-kerja": HasilKerjaForm,
    "bahan-kerja": Stub,
    "perangkat-kerja": Stub,
    "tanggung-jawab": Stub,
    "wewenang": Stub,
    "korelasi-jabatan": Stub,
    "kondisi-lingkungan-kerja": Stub,
    "risiko-bahaya": Stub,
    "syarat-jabatan": Stub,
} as const;

export const SECTION_LABELS: Record<string, string> = {
    "jabatan": "Jabatan",
    "unit-kerja": "Unit Kerja",
    "kualifikasi": "Kualifikasi Jabatan",
    "tugas-pokok": "Tugas Pokok",
    // "tahapan-uraian-tugas": "Tahapan Uraian Tugas",
    "hasil-kerja": "Hasil Kerja",
    "bahan-kerja": "Bahan Kerja",
    "perangkat-kerja": "Perangkat Kerja",
    "tanggung-jawab": "Tanggung Jawab",
    "wewenang": "Wewenang",
    "korelasi-jabatan": "Korelasi Jabatan",
    "kondisi-lingkungan-kerja": "Kondisi Lingkungan Kerja",
    "risiko-bahaya": "Risiko Bahaya",
    "syarat-jabatan": "Syarat Jabatan",
};

export const SECTION_ORDER = [
    "jabatan",
    "unit-kerja",
    "kualifikasi",
    "tugas-pokok",
    // "tahapan-uraian-tugas",
    "hasil-kerja",
    "bahan-kerja",
    "perangkat-kerja",
    "tanggung-jawab",
    "wewenang",
    "korelasi-jabatan",
    "kondisi-lingkungan-kerja",
    "risiko-bahaya",
    "syarat-jabatan",
] as const;

import JabatanForm from "./jabatan";
import UnitKerjaForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/unit-kerja";
import KualifikasiForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/kualifikasi";
import TugasPokokForm from "./tugas-pokok";
import HasilKerjaForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/hasil-kerja";
import BahanKerjaForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/bahan-kerja";
import PerangkatKerjaForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/perangkat-kerja";
import TanggungJawabForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/tanggung_jawab";
import WewenangForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/wewenang";
import KorelasiJabatanForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/korelasi-jabatan";
import KondisiLingkunganKerjaForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/kondisi-lingkungan-kerja";
import RisikoBahayaForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/risiko-bahaya";
import SyaratJabatanForm from "@/app/(admin)/(others-pages)/anjab/edit/_sections/syarat-jabatan";
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
    "bahan-kerja": BahanKerjaForm,
    "perangkat-kerja": PerangkatKerjaForm,
    "tanggung-jawab": TanggungJawabForm,
    "wewenang": WewenangForm,
    "korelasi-jabatan": KorelasiJabatanForm,
    "kondisi-lingkungan-kerja": KondisiLingkunganKerjaForm,
    "risiko-bahaya": RisikoBahayaForm,
    "syarat-jabatan": SyaratJabatanForm,
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

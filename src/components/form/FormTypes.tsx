export interface TableRow {
  id: string;
  [key: string]: any;
}

export interface FormData {
  minatKerja: string[];
  namaJabatan: string;
  kodeJabatan: string;
  unitKerja: string;
  ikhtisarJabatan: string;
  pendidikanFormal: string;
  diklatPenjenjangan: string;
  diklatTeknis: string;
  diklatFungsional: string;
  pengalamanKerja: string;
  tugasPokok: TableRow[];
  hasilKerja: TableRow[];
  bahanKerja: TableRow[];
  perangkatKerja: TableRow[];
  tanggungJawab: TableRow[];
  wewenang: TableRow[];
  korelasiJabatan: TableRow[];
  kondisiLingkungan: TableRow[];
  risikoBahaya: TableRow[];
  keterampilanKerja: string;
  bakatKerja: string[];
  temperamenKerja: string[];
  upayaFisik: string;
  kondisiFisik: string;
  prestasiDiharapkan: string;
  kelasJabatan: string;
}

export const initialFormData: FormData = {
  namaJabatan: '',
  kodeJabatan: '',
  unitKerja: '',
  ikhtisarJabatan: '',
  pendidikanFormal: '',
  diklatPenjenjangan: '',
  diklatTeknis: '',
  diklatFungsional: '',
  pengalamanKerja: '',
  tugasPokok: [],
  hasilKerja: [],
  bahanKerja: [],
  perangkatKerja: [],
  tanggungJawab: [],
  wewenang: [],
  korelasiJabatan: [],
  kondisiLingkungan: [],
  risikoBahaya: [],
  keterampilanKerja: '',
  bakatKerja: [],
  temperamenKerja: [],
  minatKerja: [],
  upayaFisik: '',
  kondisiFisik: '',
  prestasiDiharapkan: '',
  kelasJabatan: '',
};
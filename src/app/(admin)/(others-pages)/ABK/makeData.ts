export type Document = {
  id: string;
  documentName: string;
  createdAt: string;
  documentType: string;
};

export const fakeData: Document[] = [
  {
    id: '9s41rp',
    documentName: 'Analisis Jabatan PKSTI',
    createdAt: '1 hari yang lalu',
    documentType: 'Anjab',
  },
  {
    id: '08m6rx',
    documentName: 'Analisis Beban Kerja PKSTI',
    createdAt: '1 hari yang lalu',
    documentType: 'ABK',
  },
  {
    id: '5ymtrc',
    documentName: 'Analisis Jabatan Penata Keprotokolan',
    createdAt: '1 hari yang lalu',
    documentType: 'Anjab',
  },
];
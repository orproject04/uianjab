'use client';

import { FormProvider } from '../../../../../../../context/FormContext';
import PageBreadcrumb from "../../../../../../../components/common/PageBreadCrumb";
import InformasiJabatan from "../../../../../../../components/form/form-elements/InformasiJabatan";
import FileInputExample from "../../../../../../../components/form/form-elements/FileInputExample";
import KualifikasiJabatan from "../../../../../../../components/form/form-elements/KualifikasiJabatan";
import { TableSection } from '../../../../../../../components/tables/TableSection';
import { FormActions } from '../../../../../../../components/form/FormAction';
import { SyaratJabatan } from '../../../../../../../components/form/form-elements/SyaratJabatan';
import KelasJabatan from "../../../../../../../components/form/form-elements/KelasJabatan";
import PrestasiHarapan from "../../../../../../../components/form/form-elements/PrestasiHarapan"; 


export default function DocumentPage() {
  return (
    <FormProvider>
      {/* Main container - prevent any horizontal overflow */}
      <div className="min-h-screen overflow-x-hidden w-full max-w-full">
        <PageBreadcrumb pageTitle="Dokumen" />

        {/* Content wrapper with proper spacing */}
        <div className="w-full max-w-full px-4 sm:px-6 lg:px-8">
          <div className="space-y-6 w-full max-w-full">
            <InformasiJabatan />
            <KualifikasiJabatan />
            
            <TableSection
              title="Tugas Pokok"
              tableName="tugasPokok"
              columns={['uraianTugas', 'hasilKerja', 'jumlahHasil', 'waktuPenyelesaian', 'waktuEfektif', 'kebutuhanPegawai']}
              columnLabels={['Uraian Tugas', 'Hasil Kerja', 'Jumlah Hasil', 'Waktu Penyelesaian (Jam)', 'Waktu Efektif', 'Kebutuhan Pegawai']}
            />
            
            <TableSection
              title="Hasil Kerja"
              tableName="hasilKerja"
              columns={['hasilKerja', 'satuanHasil']}
              columnLabels={['Hasil Kerja', 'Satuan Hasil']}
            />

            <TableSection
              title="Bahan Kerja"
              tableName="bahanKerja"
              columns={['bahanKerja', 'penggunaanDalamTugas']}
              columnLabels={['Bahan Kerja', 'Penggunaan Dalam Tugas']}
            />

            <TableSection
              title="Perangkat Kerja"
              tableName="perangkatKerja"
              columns={['perangkatKerja', 'penggunaanDalamTugas']}
              columnLabels={['Perangkat Kerja', 'Penggunaan Dalam Tugas']}
            />

            <TableSection
              title="Tanggung Jawab"
              tableName="tanggungJawab"
              columns={['uraian']}
              columnLabels={['Uraian']}
            />

            <TableSection
              title="Wewenang"
              tableName="wewenang"
              columns={['uraian']}
              columnLabels={['Uraian']}
            />

            <TableSection
              title="Korelasi Jabatan"
              tableName="korelasiJabatan"
              columns={['jabatan', 'unitKerjaInstansi', 'dalamHal']}
              columnLabels={['Jabatan', 'Unit Kerja/Instansi', 'Dalam Hal']}
            />

            <TableSection
              title="Kondisi Lingkungan Kerja"
              tableName="kondisiLingkungan"
              columns={['aspek', 'faktor']}
              columnLabels={['Aspek', 'Faktor']}
            />

            <TableSection
              title="Risiko Bahaya"
              tableName="risikoBahaya"
              columns={['namaRisiko', 'penyebab']}
              columnLabels={['Nama Risiko', 'Penyebab']}
            />
            
            <SyaratJabatan/>
            <PrestasiHarapan />
            <KelasJabatan />
            <FileInputExample />
            <FormActions />
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
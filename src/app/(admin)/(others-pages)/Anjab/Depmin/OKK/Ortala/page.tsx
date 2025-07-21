'use client';

import { FormProvider } from '../../../../../../../components/form/FormContext';
import PageBreadcrumb from "../../../../../../../components/common/PageBreadCrumb";
import InformasiJabatan from "../../../../../../../components/form/form-elements/InformasiJabatan";
import FileInputExample from "../../../../../../../components/form/form-elements/FileInputExample";
import SelectInputs from "../../../../../../../components/form/form-elements/SelectInputs";
import TextAreaInput from "../../../../../../../components/form/form-elements/TextAreaInput";
import KualifikasiJabatan from "../../../../../../../components/form/form-elements/KualifikasiJabatan";
import { TableSection } from '../../../../../../../components/ui/table/FormTable';
import { FormActions } from '../../../../../../../components/form/FormAction';


export default function FormElements() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Dokumen" />

        <div className="space-y-6">
          <InformasiJabatan />
          <KualifikasiJabatan />
          <TableSection
            title="Tugas Pokok"
            tableName="tugasPokok"
            columns={['uraianTugas', 'hasilKerja', 'jumlahHasil', 'waktuPenyelesaian', 'waktuEfektif', 'kebutuhanPegawai']}
            columnLabels={['Uraian Tugas', 'Hasil Kerja', 'Jumlah Hasil', 'Waktu Penyelesaian (Jam)', 'Waktu Efektif', 'Kebutuhan Pegawai']}
          />
          <SelectInputs />
          <TextAreaInput />
          <FileInputExample />
        </div>
z
      </div>

  );
}

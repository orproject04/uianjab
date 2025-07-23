import React from 'react';
import Button from '../../ui/button/Button';
import { Plus, X } from 'lucide-react';
import Label from '../Label';
import Input from '../input/InputField';
import { FormSection } from '../../form/FormSection';
import { useFormContext } from '../../../context/FormContext';

export const SyaratJabatan: React.FC = () => {
  const { formData, updateField } = useFormContext();

  return (
    <FormSection title="Syarat Jabatan">
      <div className="space-y-8">
        {/* Keterampilan Kerja */}
        <div className="space-y-3">
          <Label className="text-gray-700">Keterampilan Kerja</Label>
          <Input
            value={formData.keterampilanKerja}
            onChange={(e) => updateField('keterampilanKerja', e.target.value)}
            placeholder=""
            className="w-full"
          />
        </div>

        {/* Bakat Kerja */}
        <div className="space-y-3">
          <Label className="text-gray-700">Bakat Kerja</Label>
          <div className="space-y-2">
            <Input
              value={Array.isArray(formData.bakatKerja) ? formData.bakatKerja.join(', ') : formData.bakatKerja}
              onChange={(e) => updateField('bakatKerja', e.target.value)}
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
          </div>
          <div className="flex justify-center">
          <Button
            onClick={() => updateField('minatKerja', [...(formData.minatKerja || []), ''])}
            className="bg-blue-600 hover:bg-blue-700 rounded-full h-10 w-10 p-0"
            size="sm"
          >
            <Plus className="h-5 w-5 text-white" />
          </Button>
        </div>
        </div>

        {/* Temperamen Kerja */}
        <div className="space-y-3">
          <Label className="text-gray-700">Temperamen Kerja</Label>
          <div className="space-y-2">
            <Input
              value={Array.isArray(formData.temperamenKerja) ? formData.temperamenKerja.join(', ') : formData.temperamenKerja}
              onChange={(e) => updateField('temperamenKerja', e.target.value)}
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
          </div>
          <div className="flex justify-center">
          <Button
            onClick={() => updateField('minatKerja', [...(formData.minatKerja || []), ''])}
            className="bg-blue-600 hover:bg-blue-700 rounded-full h-10 w-10 p-0"
            size="sm"
          >
            <Plus className="h-5 w-5 text-white" />
          </Button>
        </div>
        </div>

        {/* Minat Kerja */}
        <div className="space-y-3">
          <Label className="text-gray-700">Minat Kerja</Label>
          <div className="space-y-2">
            <Input
              value={Array.isArray(formData.minatKerja) ? formData.minatKerja.join(', ') : formData.minatKerja}
              onChange={(e) => updateField('minatKerja', e.target.value)}
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
            <Input
              placeholder=""
              className="w-full"
            />
          </div>
        </div>

        {/* Blue circular separator */}
        <div className="flex justify-center">
          <Button
            onClick={() => updateField('minatKerja', [...(formData.minatKerja || []), ''])}
            className="bg-blue-600 hover:bg-blue-700 rounded-full h-10 w-10 p-0"
            size="sm"
          >
            <Plus className="h-5 w-5 text-white" />
          </Button>
        </div>
        <div className="space-y-4">
              <Label>Kondisi Fisik</Label>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm text-gray-600">Jenis Kelamin</Label>
                  <Input
                    placeholder="Pria/Wanita"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Umur</Label>
                  <Input
                    placeholder="Disesuaikan"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Tinggi Badan</Label>
                  <Input
                    placeholder="Disesuaikan"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Berat Badan</Label>
                  <Input
                    placeholder="Disesuaikan"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Postur Badan</Label>
                  <Input
                    placeholder="Disesuaikan"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Penampilan</Label>
                  <Input
                    placeholder="Disesuaikan"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Keadaan Fisik</Label>
                  <Input
                    placeholder="Disesuaikan"
                  />
                </div>
              </div>
            </div>
      </div>
    </FormSection>
  );
};
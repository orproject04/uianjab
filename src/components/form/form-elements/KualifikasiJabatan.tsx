"use client";
import React, { useState } from 'react';
import ComponentCard from '../../common/ComponentCard';
import Label from '../Label';
import Input from '../input/InputField';
import TextArea from "../input/TextArea";
import { ChevronDownIcon, EyeCloseIcon, EyeIcon, TimeIcon } from '../../../icons';

export default function KualifikasiJabatan() {
  const [message, setMessage] = useState("");
    const [messageTwo, setMessageTwo] = useState("");
  const handleSelectChange = (value: string) => {
    console.log("Selected value:", value);
  };
  return (
    <ComponentCard title="Kualifikasi Jabatan">
      <div className="space-y-6">
            <div>
              <Label>Pendidikan Formal</Label>
              <Input
                placeholder="Masukkan pendidikan formal"
              />
            </div>
            
            <div className="space-y-4">
              <Label>Pendidikan dan Pelatihan</Label>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm text-gray-600">Diklat Penjenjangan</Label>
                  <Input
                    placeholder="Masukkan diklat penjenjangan"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Diklat Teknis</Label>
                  <Input
                    placeholder="Masukkan diklat teknis"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Diklat Fungsional</Label>
                  <Input
                    placeholder="Masukkan diklat fungsional"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <Label>Pengalaman Kerja</Label>
                <Input
                  placeholder=""
                />
              </div>
            </div>
      </div>

    </ComponentCard>
  );
}

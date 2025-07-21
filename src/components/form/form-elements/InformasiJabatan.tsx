"use client";
import React, { useState } from 'react';
import ComponentCard from '../../common/ComponentCard';
import Label from '../Label';
import Input from '../input/InputField';
import TextArea from "../input/TextArea";
import { ChevronDownIcon, EyeCloseIcon, EyeIcon, TimeIcon } from '../../../icons';
import DatePicker from '@/components/form/date-picker';

export default function InformasiJabatan() {
  const [message, setMessage] = useState("");
    const [messageTwo, setMessageTwo] = useState("");
  const handleSelectChange = (value: string) => {
    console.log("Selected value:", value);
  };
  return (
    <ComponentCard title="">
      <div className="space-y-6">
        <div>
          <Label>Nama Jabatan</Label>
          <Input type="text" placeholder="PKSTI" />
        </div>
        <div>
          <Label>Kode Jabatan</Label>
          <Input type="text" placeholder="---" />
        </div>
        <h3 className="text-md font-semibold">Unit Kerja</h3>
        <div>
          <Label>JPT Utama</Label>
          <Input type="text" placeholder="---" />
        </div>
        <div>
          <Label>JPT Madya</Label>
          <Input type="text" placeholder="---" />
        </div>
        <div>
          <Label>JPT Pratama</Label>
          <Input type="text" placeholder="---" />
        </div>
        <div>
          <Label>Administrator</Label>
          <Input type="text" placeholder="Kepala Bagian/Kepala Bidang/Kepala Kantor" />
        </div>
        <div>
          <Label>Pengawas</Label>
          <Input type="text" placeholder="Kepala Subbagian" />
        </div>
        <div>
          <Label>Pelaksana</Label>
          <Input type="text" placeholder="Penata Kelola Sistem dan Teknologi Informasi" />
        </div>
        <div>
          <Label>Jabatan Fungsional</Label>
          <Input type="text" placeholder="---" />
        </div>
<div className="space-y-6">
        {/* Default TextArea */}
        <div>
          <Label>Ikhtisar Jabatan</Label>
          <TextArea
            value={message}
            onChange={(value) => setMessage(value)}
            rows={6}
          />
        </div>
      </div>

        <div>
          
        </div>
      </div>
    </ComponentCard>
  );
}

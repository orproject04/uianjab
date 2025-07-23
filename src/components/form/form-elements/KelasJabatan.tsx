"use client";
import React, { useState } from 'react';
import ComponentCard from '../../common/ComponentCard';
import Label from '../Label';
import Input from '../input/InputField';
import TextArea from "../input/TextArea";
import { ChevronDownIcon, EyeCloseIcon, EyeIcon, TimeIcon } from '../../../icons';

export default function KelasJabatan() {
  const [message, setMessage] = useState("");
    const [messageTwo, setMessageTwo] = useState("");
  const handleSelectChange = (value: string) => {
    console.log("Selected value:", value);
  };
  return (
    <ComponentCard title="Kelas Jabatan">
      <div className="space-y-6">
        <div>
          <Input type="text" placeholder="Kelas 7" />
        </div>

        <div>
          
        </div>
      </div>
    </ComponentCard>
  );
}

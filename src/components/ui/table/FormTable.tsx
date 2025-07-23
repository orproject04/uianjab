'use client';

import React from 'react';
import Button from '../button/Button';
import { Input } from '../input/input';
import { Plus, X } from 'lucide-react';
import { FormSection } from '../../form/FormSection';
import { useFormContext } from '../../../context/FormContext';
import { FormData, TableRow } from '../../form/FormTypes';

interface TableSectionProps {
  title: string;
  tableName: keyof FormData;
  columns: string[];
  columnLabels: string[];
}

export const TableSection: React.FC<TableSectionProps> = ({
  title,
  tableName,
  columns,
  columnLabels
}) => {
  const { formData, addTableRow, removeTableRow, updateTableRow } = useFormContext();
  const rows = formData[tableName] as TableRow[];

  return (
    <FormSection title={title}>
      <div className="overflow-x-auto">
        <div className="border rounded-lg">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_auto] bg-gray-50 border-b">
            <div className="p-4 border-r text-center">NO</div>
            {columnLabels.map((label, idx) => (
              <div key={idx} className="p-4 border-r last:border-r-0 text-center uppercase">
                {label}
              </div>
            ))}
          </div>
          
          {/* Table Rows */}
          {rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-[auto_1fr_auto] border-b last:border-b-0">
              <div className="p-4 border-r text-center">{index + 1}</div>
              {columns.map((column, idx) => (
                <div key={idx} className="p-2 border-r last:border-r-0">
                  <Input
                    value={row[column] || ''}
                    onChange={(e) => updateTableRow(tableName, row.id, column, e.target.value)}
                    className="border-0 bg-transparent"
                    placeholder={`Masukkan ${columnLabels[idx].toLowerCase()}`}
                  />
                </div>
              ))}
              <div className="p-2 flex justify-center items-center">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => removeTableRow(tableName, row.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <Button
        onClick={() => addTableRow(tableName, columns)}
        className="bg-blue-600 hover:bg-blue-700"
        size="sm"
      >
        <Plus className="h-4 w-4 mr-2" />
        Tambah Baris
      </Button>
    </FormSection>
  );
};
'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { toast } from 'react-hot-toast'; // or your toast library
import { FormData, TableRow, initialFormData } from '../form/FormTypes';

interface FormContextType {
  formData: FormData;
  updateField: (field: keyof FormData, value: any) => void;
  addTableRow: (tableName: keyof FormData, columns: string[]) => void;
  removeTableRow: (tableName: keyof FormData, rowId: string) => void;
  updateTableRow: (tableName: keyof FormData, rowId: string, field: string, value: string) => void;
  handleSubmit: () => void;
  handleCancel: () => void;
}

const FormContext = createContext<FormContextType | undefined>(undefined);

export const useFormContext = () => {
  const context = useContext(FormContext);
  if (context === undefined) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
};

interface FormProviderProps {
  children: ReactNode;
}

export const FormProvider: React.FC<FormProviderProps> = ({ children }) => {
  const [formData, setFormData] = useState<FormData>(initialFormData);

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addTableRow = (tableName: keyof FormData, columns: string[]) => {
    const newRow: TableRow = {
      id: Date.now().toString(),
      ...Object.fromEntries(columns.map(col => [col, '']))
    };
    
    updateField(tableName, [...(formData[tableName] as TableRow[]), newRow]);
  };

  const removeTableRow = (tableName: keyof FormData, rowId: string) => {
    const currentRows = formData[tableName] as TableRow[];
    updateField(tableName, currentRows.filter(row => row.id !== rowId));
  };

  const updateTableRow = (tableName: keyof FormData, rowId: string, field: string, value: string) => {
    const currentRows = formData[tableName] as TableRow[];
    const updatedRows = currentRows.map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    );
    updateField(tableName, updatedRows);
  };

  const handleSubmit = () => {
    toast.success('Form berhasil disimpan!');
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    toast.success('Form telah direset');
  };

  const value: FormContextType = {
    formData,
    updateField,
    addTableRow,
    removeTableRow,
    updateTableRow,
    handleSubmit,
    handleCancel,
  };

  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
};
import React from 'react';
import Button from '../ui/button/Button';
import { Input } from '../ui/input/input';
import { Plus, X } from 'lucide-react';
import { FormSection } from '../form/FormSection';
import { useFormContext } from '../../context/FormContext';
import { FormData, TableRow } from '../form/FormTypes';

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
      <div className="space-y-4 w-full max-w-full">
        {/* Table container - key classes for horizontal scroll containment */}
        <div className="w-full max-w-full overflow-x-auto border border-gray-300 rounded-lg">
          {/* Table wrapper to ensure proper sizing */}
          <div className="min-w-max">
            <table className="w-full min-w-full">
              {/* Table Header */}
              <thead>
                <tr className="bg-gray-100">
                  <th className="sticky left-0 z-10 bg-gray-100 border-r border-gray-300 p-3 text-center w-16 min-w-[4rem] text-sm font-medium text-gray-700">
                    NO
                  </th>
                  {columnLabels.map((label, idx) => (
                    <th 
                      key={idx} 
                      className="border-r border-gray-300 last:border-r-0 p-3 text-center text-sm font-medium text-gray-700 uppercase min-w-[150px] whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}

                </tr>
              </thead>
              
              {/* Table Body */}
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-t border-gray-300 group hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-gray-50 group-hover:bg-gray-100 border-r border-gray-300 p-3 text-center text-sm w-16 min-w-[4rem]">
                      {index + 1}
                    </td>
                    {columns.map((column, idx) => (
                      <td key={idx} className="border-r border-gray-300 last:border-r-0 p-0 min-w-[150px]">
                        <Input
                          value={row[column] || ''}
                          onChange={(e) => updateTableRow(tableName, row.id, column, e.target.value)}
                          className="border-0 rounded-none bg-transparent focus:bg-blue-50 h-12 text-sm px-3 w-full min-w-0"
                          placeholder={`Masukkan ${columnLabels[idx].toLowerCase()}`}
                        />
                      </td>
                    ))}

                  </tr>
                ))}
                
                {/* Empty rows when no data */}
                {rows.length === 0 && (
                  <>
                    {[...Array(3)].map((_, index) => (
                      <tr key={index} className="border-t border-gray-300">
                        <td className="sticky left-0 z-10 bg-gray-50 border-r border-gray-300 p-3 text-center text-sm w-16 min-w-[4rem]">
                          {index + 1}
                        </td>
                        {columns.map((_, idx) => (
                          <td key={idx} className="border-r border-gray-300 last:border-r-0 h-12 min-w-[150px]">
                          </td>
                        ))}

                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Add Button */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={() => addTableRow(tableName, columns)}
            className="bg-blue-600 hover:bg-blue-700 rounded-full h-10 w-10 p-0 flex items-center justify-center"
            size="sm"
          >
            <Plus className="h-5 w-5 text-white" />
          </Button>
        </div>
      </div>
    </FormSection>
  );
};
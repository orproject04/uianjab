import React from 'react';
import Button from '../ui/button/Button';
import { Save, Undo } from 'lucide-react';
import { useFormContext } from '../../context/FormContext';

export const FormActions: React.FC = () => {
  const { handleSubmit, handleCancel } = useFormContext();

  return (
    <div className="flex justify-center gap-4 pt-8">
      <Button
        variant="outline"
        onClick={handleCancel}
        className="border-blue-600 text-blue-600 hover:bg-blue-50 px-8"
      >
        <Undo className="h-4 w-4 mr-2" />
        Cancel
      </Button>
      <Button
        onClick={handleSubmit}
        className="bg-blue-600 hover:bg-blue-700 px-8"
      >
        <Save className="h-4 w-4 mr-2" />
        Done
      </Button>
    </div>
  );
};
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card/FormCard';

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

export const FormSection: React.FC<FormSectionProps> = ({ title, children }) => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle className="text-xl text-gray-800">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      {children}
    </CardContent>
  </Card>
);
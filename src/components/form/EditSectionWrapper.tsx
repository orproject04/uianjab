import React, { ReactNode } from "react";

interface EditSectionWrapperProps {
    title: string;
    description?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
}

export default function EditSectionWrapper({
    title,
    description,
    icon,
    actions,
    children,
}: EditSectionWrapperProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-4">
                    {icon && (
                        <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                            {icon}
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h2>
                        {description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
                {actions && <div>{actions}</div>}
            </div>

            {/* Content */}
            <div className="p-6">{children}</div>
        </div>
    );
}

interface FormSectionProps {
    title: string;
    children: ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
}

export function FormSection({
    title,
    children,
    collapsible = false,
    defaultOpen = true,
}: FormSectionProps) {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);

    if (!collapsible) {
        return (
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                    {title}
                </h3>
                {children}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
                <span>{title}</span>
                <svg
                    className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
            {isOpen && <div>{children}</div>}
        </div>
    );
}

interface FormFieldProps {
    label: string;
    hint?: string;
    required?: boolean;
    children: ReactNode;
}

export function FormField({ label, hint, required, children }: FormFieldProps) {
    return (
        <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
            {hint && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
            )}
        </div>
    );
}

interface FormActionsProps {
    children: ReactNode;
}

export function FormActions({ children }: FormActionsProps) {
    return (
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
            {children}
        </div>
    );
}

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

export function useToast() {
  const [toast, setToast] = React.useState<{
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
  } | null>(null);

  const showToast = (props: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
  }) => {
    setToast({
      title: props.title,
      description: props.description,
      variant: props.variant || 'default',
    });

    // Hide toast after 5 seconds
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  return { toast, showToast };
}

export const toastVariants = cva(
  'fixed top-4 right-4 z-50 w-full max-w-sm rounded-lg p-4 shadow-lg transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
        destructive: 'bg-red-500 text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface ToastProps extends VariantProps<typeof toastVariants> {
  title: string;
  description?: string;
  onDismiss?: () => void;
}

export function Toast({ title, description, variant, onDismiss }: ToastProps) {
  return (
    <div className={toastVariants({ variant })}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium">{title}</h3>
          {description && <p className="text-sm opacity-90">{description}</p>}
        </div>
        <button
          onClick={onDismiss}
          className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ×
        </button>
      </div>
    </div>
  );
}

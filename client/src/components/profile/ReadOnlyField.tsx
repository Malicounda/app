import { cn } from '@/lib/utils';

interface ReadOnlyFieldProps {
  label: string;
  value?: string | number | null;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function ReadOnlyField({
  label,
  value,
  className = '',
  labelClassName = '',
  valueClassName = '',
  icon,
  onClick,
}: ReadOnlyFieldProps) {
  const content = (
    <div className={cn('flex items-start', className)}>
      <div className={cn('flex-1')}>
        <div className={cn('text-sm font-medium text-gray-500', labelClassName)}>
          {label}
        </div>
        <div className={cn('mt-1 text-sm text-gray-900', valueClassName, {
          'cursor-pointer hover:text-blue-600': onClick,
        })}>
          {value || '-'}
        </div>
      </div>
      {icon && (
        <div className="ml-2 flex-shrink-0">
          {icon}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button 
        type="button" 
        onClick={onClick}
        className="w-full text-left"
      >
        {content}
      </button>
    );
  }

  return content;
}

export default ReadOnlyField;

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void> | void;
  type?: string;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  validate?: (value: string) => string | null;
  options?: { value: string; label: string }[];
}

export function EditableField({
  label,
  value: initialValue,
  onSave,
  type = 'text',
  className = '',
  inputClassName = '',
  labelClassName = '',
  validate,
  options,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (type === 'text' || type === 'email' || type === 'tel') {
        inputRef.current.select();
      }
    }
  }, [isEditing, type]);

  const handleSave = async () => {
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    try {
      setIsSaving(true);
      await onSave(value);
      setIsEditing(false);
      setError(null);
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(initialValue);
    setIsEditing(false);
    setError(null);
  };

  if (!isEditing) {
    return (
      <div className={cn('flex items-center justify-between group', className)}>
        <div>
          <div className={cn('text-sm font-medium text-gray-500', labelClassName)}>
            {label}
          </div>
          <div className="mt-1 text-sm text-gray-900">
            {value || '-'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setIsEditing(true)}
        >
          <Edit className="h-4 w-4" />
          <span className="sr-only">Modifier</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <label
        htmlFor={label}
        className={cn('block text-sm font-medium text-gray-700', labelClassName)}
      >
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        {type === 'select' && options ? (
          <select
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              inputClassName
            )}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            ref={inputRef}
            id={label}
            type={type}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClassName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
        )}
        <Button
          variant="outline"
          size="icon"
          onClick={handleSave}
          disabled={isSaving}
          className="shrink-0"
        >
          <Check className="h-4 w-4" />
          <span className="sr-only">Enregistrer</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCancel}
          disabled={isSaving}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Annuler</span>
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default EditableField;

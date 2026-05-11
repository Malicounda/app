import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User as UserIcon, Users as UsersIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export interface InternalMessageComposerTarget {
  key: string;
  label: string;
  description?: string;
}

export interface InternalMessageComposerRegionOption {
  value: string;
  label: string;
}

export interface InternalMessageComposerSubmitPayload {
  type: "individual" | "group";
  content: string;
  recipientIdentifier?: string;
  selectedTargets?: string[];
  attachment?: File | null;
  regionValue?: string;
}

interface InternalMessageComposerProps {
  loading?: boolean;
  onSubmit: (payload: InternalMessageComposerSubmitPayload) => Promise<boolean> | boolean;
  regionTargets?: InternalMessageComposerTarget[];
  allowIndividual?: boolean;
  allowGroup?: boolean;
  defaultMode?: "individual" | "group";
  maxLength?: number;
  regionOptions?: InternalMessageComposerRegionOption[];
  defaultRegionValue?: string;
  adminRecipients?: Array<{ value: string; label: string }>;
  showAdminQuickPick?: boolean;
}

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 Mo

const INDIVIDUAL_PLACEHOLDER = "Matricule, e-mail ou numéro de pièce d'identité";

export function InternalMessageComposer({
  loading,
  onSubmit,
  regionTargets = [],
  allowIndividual = true,
  allowGroup = true,
  defaultMode = "individual",
  maxLength = 160,
  regionOptions = [],
  defaultRegionValue,
  adminRecipients = [],
  showAdminQuickPick = false,
}: InternalMessageComposerProps) {
  const hasGroupMode = allowGroup && regionTargets.length > 0;
  const hasIndividualMode = allowIndividual;
  const initialMode = useMemo(() => {
    if (!hasIndividualMode && hasGroupMode) {
      return "group";
    }
    if (!hasGroupMode && hasIndividualMode) {
      return "individual";
    }
    return defaultMode;
  }, [defaultMode, hasGroupMode, hasIndividualMode]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"individual" | "group">(initialMode);
  const [message, setMessage] = useState("");
  const [recipientValue, setRecipientValue] = useState("");
  const [recipientSelected, setRecipientSelected] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionValue, setRegionValue] = useState<string | undefined>(() => {
    if (!regionOptions.length) return undefined;
    return defaultRegionValue ?? regionOptions[0]?.value;
  });

  const toggleTarget = (key: string) => {
    setSelectedTargets((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const resetForm = () => {
    setMessage("");
    setRecipientValue("");
    setRecipientSelected(false);
    setSelectedTargets([]);
    setAttachment(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError("Le message ne peut pas être vide.");
      return;
    }
    if (message.length > maxLength) {
      setError(`Le message doit contenir au maximum ${maxLength} caractères.`);
      return;
    }
    if (attachment && attachment.size > MAX_ATTACHMENT_SIZE) {
      setError("La pièce jointe ne doit pas dépasser 5 Mo.");
      return;
    }

    if (mode === "individual" && hasIndividualMode) {
      const trimmedRecipient = recipientValue.trim();
      if (!trimmedRecipient) {
        setError("Veuillez saisir le matricule, l'e-mail ou le numéro de pièce d'identité du destinataire.");
        return;
      }
      const result = await onSubmit({
        type: "individual",
        content: message.trim(),
        recipientIdentifier: trimmedRecipient,
        attachment,
      });
      if (result) {
        resetForm();
      }
      return;
    }

    if (mode === "group" && hasGroupMode) {
      if (!selectedTargets.length) {
        setError("Sélectionnez au moins un groupe de destinataires.");
        return;
      }
      const result = await onSubmit({
        type: "group",
        content: message.trim(),
        selectedTargets,
        attachment,
        regionValue,
      });
      if (result) {
        resetForm();
      }
      return;
    }

    setError("Mode d'envoi indisponible.");
  };

  return (
    <div className="w-full space-y-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium text-gray-700">Type d'envoi</Label>
        <div className="flex items-center gap-2">
          {hasIndividualMode && (
            <button
              type="button"
              onClick={() => {
                setMode("individual");
                setError(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm border transition-colors ${mode === 'individual' ? 'bg-green-700 border-green-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <UserIcon className={`h-4 w-4 ${mode === 'individual' ? 'text-white' : 'text-gray-500'}`} />
              Envoi individuel
            </button>
          )}
          {hasGroupMode && (
            <button
              type="button"
              onClick={() => {
                setMode("group");
                setError(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm border transition-colors ${mode === 'group' ? 'bg-green-700 border-green-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <UsersIcon className={`h-4 w-4 ${mode === 'group' ? 'text-white' : 'text-gray-500'}`} />
              Envoi groupé
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-[170px]">
        {hasIndividualMode && (
          <div className={`absolute inset-0 transition-opacity ${mode === 'individual' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="space-y-1">
              <Label htmlFor="internal-message-recipient" className="text-sm font-medium text-gray-700">
                Destinataire
              </Label>
              <div className="flex flex-col gap-1">
                {showAdminQuickPick && Array.isArray(adminRecipients) && adminRecipients.length > 0 && (
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                      onChange={(e) => {
                        const v = e.target.value;
                        setRecipientValue(v);
                        setRecipientSelected(Boolean(String(v || '').trim()));
                      }}
                      value={recipientValue}
                    >
                      <option value="">— Sélectionner un destinataire —</option>
                      {adminRecipients.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="internal-message-recipient"
                    className={`w-full pl-9 ${recipientSelected ? 'bg-gray-100 text-gray-500' : ''}`}
                    value={recipientValue}
                    onChange={(event) => {
                      setRecipientValue(event.target.value);
                      setRecipientSelected(false);
                    }}
                    placeholder={INDIVIDUAL_PLACEHOLDER}
                    disabled={recipientSelected}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-snug">
                Indiquez le matricule, l'adresse e-mail ou le numéro de pièce d'identité du destinataire. Vous pouvez en mettre plusieurs en les séparant par ";".
              </p>
            </div>
          </div>
        )}

        {hasGroupMode && (
          <div className={`absolute inset-0 transition-opacity ${mode === 'group' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-gray-700">Destinataires</Label>
                <div className="flex flex-wrap gap-2">
                  {regionTargets.map((target) => {
                    const active = selectedTargets.includes(target.key);
                    return (
                      <button
                        key={target.key}
                        type="button"
                        onClick={() => toggleTarget(target.key)}
                        className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm border transition-colors ${active ? 'bg-green-700 border-green-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {target.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {regionOptions.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="internal-message-region" className="text-sm font-medium text-gray-700">
                    Région ciblée
                  </Label>
                  <select
                    id="internal-message-region"
                    value={regionValue ?? ""}
                    onChange={(event) => setRegionValue(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {regionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="internal-message-content" className="text-sm font-medium text-gray-700">
          Message
        </Label>
        <div className="relative">
          <Textarea
            id="internal-message-content"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={maxLength}
            placeholder={`Écrivez votre message (${maxLength} caractères max).`}
            className="min-h-[120px] resize-none"
          />
          <div className="absolute bottom-2 right-3 text-xs text-gray-400">
            {message.length} / {maxLength}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-sm font-medium text-gray-700">Pièce jointe (optionnelle)</Label>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setAttachment(file);
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
        >
          <div className="text-sm font-medium text-green-700">Joindre un fichier</div>
          <div className="text-xs text-gray-500">Glissez-déposez un fichier ici ou cliquez pour sélectionner</div>
          {attachment && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-gray-700 truncate">{attachment.name}</div>
              <span
                className="text-xs text-red-600 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAttachment(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              >
                Retirer
              </span>
            </div>
          )}
        </button>
        <p className="text-xs text-gray-500">Formats acceptés selon configuration du serveur. Taille maximale 5 Mo.</p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end -mt-1">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="bg-green-700 hover:bg-green-800"
        >
          {loading ? "Envoi..." : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}

export default InternalMessageComposer;

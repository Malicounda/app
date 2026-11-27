import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Check, Search, ShieldAlert, UserCheck, UserX } from 'lucide-react';

interface CandidateUser {
  id: number;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  hunterId?: number | null;
  isLinked: boolean;
  isActive: boolean;
  isSuspended: boolean;
  accessActive: boolean;
}

export interface LinkHunterTarget {
  hunter: {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string | null;
    idNumber?: string | null;
    category?: string | null;
  };
  region?: string | null;
  zone?: string | null;
  documentsCompleted: number;
  documentsTotal: number;
  documentsPercent: number;
}

interface LinkHunterProfileProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  target: LinkHunterTarget | null;
}

export function LinkHunterProfile({
  open,
  onClose,
  onSuccess,
  target,
}: LinkHunterProfileProps) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showAlreadyLinked, setShowAlreadyLinked] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: usersResp, isLoading } = useQuery({
    queryKey: ['available-hunter-users', open],
    enabled: open,
    queryFn: () =>
      apiRequest<{ ok: boolean; data: CandidateUser[] }>({
        url: '/api/admin/available-hunter-users',
        method: 'GET',
      }),
  });

  const allCandidates: CandidateUser[] = (usersResp as any)?.data ?? [];

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCandidates.filter((u) => {
      if (!showAlreadyLinked && u.isLinked) return false;
      if (!q) return true;
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return (
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    });
  }, [allCandidates, search, showAlreadyLinked]);

  const selectedCandidate = useMemo(
    () => allCandidates.find((u) => u.id === selectedUserId) || null,
    [allCandidates, selectedUserId]
  );

  const handleSubmit = async () => {
    if (!target || !selectedUserId) return;
    try {
      setIsSubmitting(true);
      await apiRequest({
        url: '/api/admin/link-hunter-profile',
        method: 'POST',
        data: {
          userId: selectedUserId,
          hunterId: target.hunter.id,
          notes: notes.trim() || undefined,
        },
      });

      toast({
        title: 'Profil associé',
        description: `Le dossier de ${target.hunter.firstName} ${target.hunter.lastName} a été associé avec succès.`,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Association impossible',
        description: error?.message || "Une erreur est survenue lors de l'association du profil.",
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent hideClose className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Associer un compte utilisateur</DialogTitle>
          <DialogDescription>
            Sélectionnez un compte utilisateur actif à relier à ce profil chasseur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Résumé du chasseur sélectionné (sans ID technique) */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-sm">
                {target.hunter.firstName} {target.hunter.lastName}
              </div>
              <Badge variant="outline" className="text-xs">
                Dossier : {target.documentsCompleted}/{target.documentsTotal} ({target.documentsPercent}%)
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
              {target.hunter.phone && <span>Tél. : {target.hunter.phone}</span>}
              {target.hunter.idNumber && <span>Pièce : {target.hunter.idNumber}</span>}
              {(target.region || target.zone) && (
                <span>{[target.region, target.zone].filter(Boolean).join(' · ')}</span>
              )}
            </div>
          </div>

          {/* Sélecteur de compte utilisateur */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">Compte utilisateur</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAlreadyLinked}
                  onChange={(e) => setShowAlreadyLinked(e.target.checked)}
                  className="rounded border-input"
                />
                Inclure les comptes déjà associés
              </label>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, identifiant, email ou téléphone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Chargement des comptes disponibles...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Aucun compte chasseur disponible trouvé.
                </div>
              ) : (
                filteredCandidates.map((u) => {
                  const isSelected = selectedUserId === u.id;
                  const disabled = !u.accessActive;
                  const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();

                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                        disabled
                          ? 'opacity-60 cursor-not-allowed bg-muted/30'
                          : isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium truncate">
                            {displayName || u.username}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            @{u.username}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!u.accessActive ? (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <UserX className="h-3 w-3" />
                            Désactivé
                          </Badge>
                        ) : u.isLinked ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Déjà associé
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50 gap-1">
                            <UserCheck className="h-3 w-3" />
                            Disponible
                          </Badge>
                        )}
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedCandidate?.isLinked && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Ce compte est déjà lié à un autre profil chasseur. L&apos;association le transférera vers ce chasseur.
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="link-hunter-notes" className="text-sm font-medium">
              Notes (optionnel)
            </Label>
            <Input
              id="link-hunter-notes"
              placeholder="Ex. : Validation manuelle du compte après vérification..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedUserId || !selectedCandidate?.accessActive}
          >
            {isSubmitting ? 'Association...' : 'Associer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

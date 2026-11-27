import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { apiRequest } from '@/lib/queryClient';
import { isUserSuperAdmin } from '@/utils/navigation';
import { repairAttachmentFileName } from '@/lib/attachmentMime';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  KeyRound,
  Send,
  Settings2,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { AutoValidationRulesTab } from './AutoValidationRulesTab';

type HunterDocItem = {
  code: string;
  label: string;
  present: boolean;
  name?: string | null;
  expiryDate?: string | null;
  status: 'missing' | 'valid' | 'expired';
  invalidated?: boolean;
};

type DossierVerification = {
  hunterId: number;
  status: 'pending' | 'validated' | 'rejected';
  invalidatedDocs: string[];
  reason: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  updatedAt: string | null;
};

type HunterProfileRow = {
  user?: {
    id: number;
    username?: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    isActive?: boolean;
    isSuspended?: boolean;
    accessActive?: boolean;
  } | null;
  hunter: {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string | null;
    idNumber?: string | null;
    category?: string | null;
    isActive?: boolean;
  };
  region?: string | null;
  zone?: string | null;
  documents: HunterDocItem[];
  documentsCompleted: number;
  documentsTotal: number;
  documentsPercent: number;
  documentsUpdatedAt?: string | null;
  verification?: DossierVerification;
};

type FilterMode = 'all' | 'pending' | 'validated' | 'rejected' | 'active' | 'disabled' | 'no_account';

function getProgressColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-600';
  if (percent >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function HunterProfilesManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<'dossiers' | 'rules'>('dossiers');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [detailRow, setDetailRow] = useState<HunterProfileRow | null>(null);
  const [accessTarget, setAccessTarget] = useState<{ row: HunterProfileRow; nextActive: boolean } | null>(null);
  const [togglingAccess, setTogglingAccess] = useState(false);
  const [createAccessRow, setCreateAccessRow] = useState<HunterProfileRow | null>(null);
  const [newAccessUsername, setNewAccessUsername] = useState('');
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string } | null>(null);
  const [openingDocCode, setOpeningDocCode] = useState<string | null>(null);
  const [selectedInvalidDocs, setSelectedInvalidDocs] = useState<string[]>([]);
  const [reviewMessage, setReviewMessage] = useState('');
  const [submittingReview, setSubmittingReview] = useState<'validate' | 'invalidate' | null>(null);
  const [confirmValidateOpen, setConfirmValidateOpen] = useState(false);

  const openDetailModal = (row: HunterProfileRow) => {
    setDetailRow(row);
    setSelectedInvalidDocs(row.verification?.invalidatedDocs ?? []);
    setReviewMessage(row.verification?.status === 'rejected' ? (row.verification?.reason ?? '') : '');
    setConfirmValidateOpen(false);
  };

  const toggleDocSelection = (code: string) => {
    setSelectedInvalidDocs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Analyse de cohérence des documents pour le dossier actuellement ouvert
  const detailAnalysis = useMemo(() => {
    const docs = detailRow?.documents ?? [];
    const missingDocs = docs.filter((d) => !d.present);
    const expiredDocs = docs.filter((d) => d.status === 'expired');
    const invalidatedDocs = docs.filter((d) => d.invalidated);
    const checkedInvalidDocs = docs.filter((d) => selectedInvalidDocs.includes(d.code));
    const hasValidationAnomalies =
      missingDocs.length > 0 ||
      expiredDocs.length > 0 ||
      invalidatedDocs.length > 0 ||
      checkedInvalidDocs.length > 0;

    const savedInvalidSorted = [...(detailRow?.verification?.invalidatedDocs ?? [])].sort().join(',');
    const currentInvalidSorted = [...selectedInvalidDocs].sort().join(',');
    const isSameInvalidationAlreadySent =
      detailRow?.verification?.status === 'rejected' &&
      selectedInvalidDocs.length > 0 &&
      savedInvalidSorted === currentInvalidSorted &&
      reviewMessage.trim() === (detailRow?.verification?.reason ?? '').trim();

    const isAlreadyValidated =
      detailRow?.verification?.status === 'validated' && selectedInvalidDocs.length === 0;

    return {
      docs,
      missingDocs,
      expiredDocs,
      invalidatedDocs,
      checkedInvalidDocs,
      hasValidationAnomalies,
      isSameInvalidationAlreadySent,
      isAlreadyValidated,
    };
  }, [detailRow, selectedInvalidDocs, reviewMessage]);

  const executeValidateDossier = async () => {
    if (!detailRow) return;
    try {
      setSubmittingReview('validate');
      const res: any = await apiRequest({
        url: `/api/admin/hunter-profiles/${detailRow.hunter.id}/validate`,
        method: 'POST',
        data: { note: reviewMessage.trim() || undefined },
      });
      toast({
        title: 'Dossier validé',
        description: res?.messageSent
          ? `Le dossier de ${detailRow.hunter.firstName} ${detailRow.hunter.lastName} est validé et un message lui a été envoyé. Il peut désormais faire sa demande de permis.`
          : `Le dossier de ${detailRow.hunter.firstName} ${detailRow.hunter.lastName} est validé (aucun compte lié pour l'envoi de message).`,
      });
      setConfirmValidateOpen(false);
      setDetailRow(null);
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur de validation',
        description: err?.message || 'Impossible de valider ce dossier.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingReview(null);
    }
  };

  const handleValidateDossier = () => {
    if (!detailRow) return;
    if (detailAnalysis.hasValidationAnomalies) {
      setConfirmValidateOpen(true);
      return;
    }
    void executeValidateDossier();
  };

  const handleInvalidateDossier = async () => {
    if (!detailRow) return;
    if (selectedInvalidDocs.length === 0) {
      toast({
        title: 'Aucune pièce sélectionnée',
        description: 'Cochez au moins une pièce à invalider (ou cliquez sur Tout sélectionner).',
        variant: 'destructive',
      });
      return;
    }
    if (!reviewMessage.trim()) {
      toast({
        title: 'Motif requis',
        description: 'Veuillez saisir un message expliquant au chasseur la raison de l’invalidation.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setSubmittingReview('invalidate');
      const res: any = await apiRequest({
        url: `/api/admin/hunter-profiles/${detailRow.hunter.id}/invalidate`,
        method: 'POST',
        data: {
          documentCodes: selectedInvalidDocs,
          reason: reviewMessage.trim(),
        },
      });
      toast({
        title: 'Pièce(s) invalidée(s)',
        description: res?.messageSent
          ? `${selectedInvalidDocs.length} pièce(s) invalidée(s) et message explicatif envoyé dans la messagerie du chasseur.`
          : `${selectedInvalidDocs.length} pièce(s) invalidée(s) (aucun compte lié pour l'envoi de message).`,
      });
      setDetailRow(null);
      refetch();
    } catch (err: any) {
      toast({
        title: "Erreur d'invalidation",
        description: err?.message || "Impossible d'invalider ces pièces.",
        variant: 'destructive',
      });
    } finally {
      setSubmittingReview(null);
    }
  };

  const isSuperAdmin = isUserSuperAdmin(user);

  const { data: profilesResp, refetch } = useQuery({
    queryKey: ['hunter-profiles', isSuperAdmin ? 'all' : user?.region, isSuperAdmin ? 'all' : user?.zone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!isSuperAdmin) {
        if (user?.region) params.append('region', user.region);
        if (user?.zone) params.append('zone', user.zone);
      }

      const qs = params.toString();
      return apiRequest({
        url: qs ? `/api/admin/hunter-profiles?${qs}` : '/api/admin/hunter-profiles',
        method: 'GET',
      });
    },
  });

  const profiles: HunterProfileRow[] = (profilesResp as any)?.data ?? [];

  const counts = useMemo(() => {
    const active = profiles.filter((p) => p.user && p.user.accessActive !== false).length;
    const disabled = profiles.filter((p) => p.user && p.user.accessActive === false).length;
    const noAccount = profiles.filter((p) => !p.user).length;
    const validated = profiles.filter((p) => p.verification?.status === 'validated').length;
    const rejected = profiles.filter((p) => p.verification?.status === 'rejected').length;
    const pending = profiles.filter((p) => !p.verification || p.verification.status === 'pending').length;
    return { all: profiles.length, pending, validated, rejected, active, disabled, noAccount };
  }, [profiles]);

  const handleOpenDocument = async (hunterId: number, doc: HunterDocItem) => {
    try {
      setOpeningDocCode(doc.code);
      const res = await authenticatedFetch(`/api/attachments/${hunterId}/${doc.code}?inline=1`);
      if (!res.ok) {
        throw new Error('Impossible de charger ce document.');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) {
      toast({
        title: 'Aperçu indisponible',
        description: err?.message || 'Erreur lors de la lecture du document.',
        variant: 'destructive',
      });
    } finally {
      setOpeningDocCode(null);
    }
  };

  const handleConfirmToggleAccess = async () => {
    if (!accessTarget) return;
    const { row, nextActive } = accessTarget;
    try {
      setTogglingAccess(true);
      await apiRequest({
        url: `/api/admin/hunter-profiles/${row.hunter.id}/toggle-access`,
        method: 'POST',
        data: { active: nextActive },
      });
      toast({
        title: nextActive ? 'Accès rétabli' : 'Accès coupé',
        description: nextActive
          ? `Le compte @${row.user?.username} de ${row.hunter.firstName} ${row.hunter.lastName} est à nouveau actif.`
          : `L'accès au compte @${row.user?.username} de ${row.hunter.firstName} ${row.hunter.lastName} a été bloqué.`,
      });
      setAccessTarget(null);
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || "Impossible de modifier l'accès à ce compte.",
        variant: 'destructive',
      });
    } finally {
      setTogglingAccess(false);
    }
  };

  const openCreateAccessModal = (row: HunterProfileRow) => {
    const phoneDigits = String(row.hunter.phone || '').replace(/[^0-9]/g, '');
    const fallback = phoneDigits.length >= 6 ? phoneDigits : String(row.hunter.idNumber || '').replace(/\s+/g, '');
    setNewAccessUsername(fallback);
    setCreatedCreds(null);
    setCreateAccessRow(row);
  };

  const handleCreateAccess = async () => {
    if (!createAccessRow) return;
    try {
      setCreatingAccess(true);
      const res: any = await apiRequest({
        url: `/api/admin/hunter-profiles/${createAccessRow.hunter.id}/create-access`,
        method: 'POST',
        data: { username: newAccessUsername.trim() },
      });
      setCreatedCreds(res?.credentials ?? { username: newAccessUsername.trim(), password: 'chasse000' });
      toast({
        title: 'Accès créé',
        description: `Compte créé pour ${createAccessRow.hunter.firstName} ${createAccessRow.hunter.lastName} (mot de passe : chasse000).`,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || 'Impossible de créer cet accès.',
        variant: 'destructive',
      });
    } finally {
      setCreatingAccess(false);
    }
  };

  const columns: any[] = [
    {
      accessorKey: 'user',
      header: 'Utilisateur',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => {
        const u = row.original.user;
        if (!u) {
          return <span className="text-sm text-muted-foreground italic">Non associé</span>;
        }
        return (
          <div className="min-w-[140px]">
            <div className="font-medium flex items-center gap-1.5 flex-wrap">
              <span>{u.username}</span>
              {u.accessActive === false && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Désactivé
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{u.email}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'hunter',
      header: 'Chasseur',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => {
        const h = row.original.hunter;
        const meta = [h.phone, h.idNumber ? `Pièce: ${h.idNumber}` : null].filter(Boolean).join(' · ');
        return (
          <div className="min-w-[160px]">
            <div className="font-medium">
              {h.firstName} {h.lastName}
            </div>
            {meta ? (
              <div className="text-xs text-muted-foreground">{meta}</div>
            ) : h.category ? (
              <div className="text-xs text-muted-foreground capitalize">{h.category}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'documents',
      header: 'Dossier / Documents',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => {
        const { documentsCompleted = 0, documentsTotal = 7, documentsPercent = 0 } = row.original;
        return (
          <button
            type="button"
            onClick={() => openDetailModal(row.original)}
            className="w-full min-w-[140px] max-w-[190px] text-left group cursor-pointer"
            title="Cliquer pour inspecter et valider le dossier"
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-foreground group-hover:text-primary">
                {documentsPercent}%
              </span>
              <span className="text-muted-foreground">
                {documentsCompleted}/{documentsTotal} docs
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getProgressColor(documentsPercent)}`}
                style={{ width: `${Math.min(100, Math.max(0, documentsPercent))}%` }}
              />
            </div>
          </button>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => {
        const u = row.original.user;
        const vStatus = row.original.verification?.status ?? 'pending';
        const invalidCount = row.original.verification?.invalidatedDocs?.length ?? 0;

        return (
          <div className="flex flex-col items-start gap-1">
            {vStatus === 'validated' ? (
              <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200 whitespace-nowrap">
                <ShieldCheck className="h-3 w-3" />
                Dossier validé
              </Badge>
            ) : vStatus === 'rejected' ? (
              <Badge variant="destructive" className="gap-1 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3" />
                À corriger ({invalidCount})
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">
                <Clock className="h-3 w-3" />
                En attente
              </Badge>
            )}
            {!u ? (
              <span className="text-[11px] text-muted-foreground">Compte non associé</span>
            ) : u.accessActive === false ? (
              <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0 whitespace-nowrap">
                <ShieldOff className="h-2.5 w-2.5" />
                Compte désactivé
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'location',
      header: 'Région / Zone',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => {
        const loc = [row.original.region, row.original.zone].filter(Boolean).join(' · ');
        return <span className="text-sm text-muted-foreground">{loc || '—'}</span>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: { row: { original: HunterProfileRow } }) => {
        const item = row.original;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDetailModal(item)}
              className="gap-1"
              title="Inspecter, valider ou invalider les documents du dossier"
            >
              <Eye className="h-3.5 w-3.5" />
              Dossier
            </Button>
            {!item.user ? (
              <Button
                size="sm"
                onClick={() => openCreateAccessModal(item)}
                className="gap-1"
                title="Créer un compte dédié (mot de passe : chasse000)"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Créer accès
              </Button>
            ) : item.user.accessActive === false ? (
              <Button
                size="sm"
                onClick={() => setAccessTarget({ row: item, nextActive: true })}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Rétablir la connexion à ce compte chasseur"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Rétablir accès
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setAccessTarget({ row: item, nextActive: false })}
                className="gap-1"
                title="Couper / bloquer la connexion au compte chasseur"
              >
                <ShieldOff className="h-3.5 w-3.5" />
                Couper accès
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return profiles.filter((profile) => {
      const vStatus = profile.verification?.status ?? 'pending';
      if (filterMode === 'pending' && vStatus !== 'pending') return false;
      if (filterMode === 'validated' && vStatus !== 'validated') return false;
      if (filterMode === 'rejected' && vStatus !== 'rejected') return false;
      if (filterMode === 'active' && !(profile.user && profile.user.accessActive !== false)) return false;
      if (filterMode === 'disabled' && !(profile.user && profile.user.accessActive === false)) return false;
      if (filterMode === 'no_account' && profile.user) return false;

      if (!q) return true;
      return (
        (profile.hunter.firstName || '').toLowerCase().includes(q) ||
        (profile.hunter.lastName || '').toLowerCase().includes(q) ||
        (profile.hunter.phone || '').toLowerCase().includes(q) ||
        (profile.hunter.idNumber || '').toLowerCase().includes(q) ||
        (profile.user?.username || '').toLowerCase().includes(q) ||
        (profile.user?.email || '').toLowerCase().includes(q) ||
        (profile.region || '').toLowerCase().includes(q) ||
        (profile.zone || '').toLowerCase().includes(q)
      );
    });
  }, [profiles, searchTerm, filterMode]);

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gestion des profils chasseurs</h1>
          <p className="text-sm opacity-75">
            Vérification des dossiers, contrôle d&apos;accès aux comptes et règles d&apos;auto-validation
          </p>
        </div>
        {activeView === 'dossiers' && (
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Input
              placeholder="Rechercher (nom, téléphone, compte, région)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-72"
            />
          </div>
        )}
      </div>

      {/* Onglets (onglet Règles d'auto-validation réservé au SuperAdmin) */}
      {isSuperAdmin && (
        <div className="flex flex-wrap gap-2 border-b pb-2">
          <Button
            size="sm"
            variant={activeView === 'dossiers' ? 'default' : 'outline'}
            onClick={() => setActiveView('dossiers')}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" />
            Dossiers chasseurs ({counts.all})
          </Button>
          <Button
            size="sm"
            variant={activeView === 'rules' ? 'default' : 'outline'}
            onClick={() => setActiveView('rules')}
            className="gap-1.5"
          >
            <Settings2 className="h-4 w-4" />
            Règles d&apos;auto-validation (SuperAdmin)
          </Button>
        </div>
      )}

      {activeView === 'rules' && isSuperAdmin ? (
        <AutoValidationRulesTab />
      ) : (
        <>
          {/* Filtres rapides */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filterMode === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterMode('all')}
            >
              Tous ({counts.all})
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilterMode('pending')}
            >
              En attente ({counts.pending})
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'validated' ? 'default' : 'outline'}
              onClick={() => setFilterMode('validated')}
            >
              Validés ({counts.validated})
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'rejected' ? 'destructive' : 'outline'}
              onClick={() => setFilterMode('rejected')}
            >
              À corriger ({counts.rejected})
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'active' ? 'default' : 'outline'}
              onClick={() => setFilterMode('active')}
            >
              Accès actifs ({counts.active})
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'disabled' ? 'destructive' : 'outline'}
              onClick={() => setFilterMode('disabled')}
            >
              Accès coupés ({counts.disabled})
            </Button>
            {counts.noAccount > 0 && (
              <Button
                size="sm"
                variant={filterMode === 'no_account' ? 'default' : 'outline'}
                onClick={() => setFilterMode('no_account')}
              >
                Sans compte ({counts.noAccount})
              </Button>
            )}
          </div>

          <Card className="min-w-0 overflow-hidden">
            <CardContent className="p-3 sm:p-6 min-w-0">
              <div className="w-full overflow-x-auto">
                <DataTable columns={columns as any} data={filteredData as any} />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal Détail du Dossier & Documents */}
      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent hideClose className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {detailRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Dossier de {detailRow.hunter.firstName} {detailRow.hunter.lastName}
                </DialogTitle>
                <DialogDescription>
                  État détaillé des pièces justificatives et du compte associé.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Infos chasseur & compte */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Chasseur</div>
                    <div className="font-medium">
                      {detailRow.hunter.firstName} {detailRow.hunter.lastName}
                    </div>
                    {detailRow.hunter.phone && (
                      <div className="text-xs text-muted-foreground">Tél. : {detailRow.hunter.phone}</div>
                    )}
                    {detailRow.hunter.idNumber && (
                      <div className="text-xs text-muted-foreground">N° Pièce : {detailRow.hunter.idNumber}</div>
                    )}
                    {(detailRow.region || detailRow.zone) && (
                      <div className="text-xs text-muted-foreground">
                        {[detailRow.region, detailRow.zone].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Compte associé</div>
                    {detailRow.user ? (
                      <>
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          <span>@{detailRow.user.username}</span>
                          {detailRow.user.accessActive === false ? (
                            <Badge variant="destructive" className="text-[10px]">Désactivé</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-800">Actif</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{detailRow.user.email}</div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">Aucun compte utilisateur associé</div>
                    )}
                  </div>
                </div>

                {/* Statut de vérification du dossier */}
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    detailRow.verification?.status === 'validated'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : detailRow.verification?.status === 'rejected'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold flex items-center gap-1.5">
                      {detailRow.verification?.status === 'validated' ? (
                        <>
                          <ShieldCheck className="h-4 w-4 text-emerald-700" />
                          Dossier validé — Demande de permis autorisée
                        </>
                      ) : detailRow.verification?.status === 'rejected' ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-700" />
                          Dossier invalidé — En attente de correction ({detailRow.verification.invalidatedDocs.length} pièce(s))
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-amber-700" />
                          En attente de vérification — Demande de permis bloquée
                        </>
                      )}
                    </div>
                    {detailRow.verification?.reviewedAt && (
                      <span className="text-xs opacity-75">
                        Le {new Date(detailRow.verification.reviewedAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                  {detailRow.verification?.status === 'rejected' && detailRow.verification?.reason && (
                    <p className="text-xs mt-1.5 opacity-90">
                      <strong>Dernier motif envoyé :</strong> {detailRow.verification.reason}
                    </p>
                  )}
                </div>

                {/* Barre de progression globale */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Taux de remplissage du dossier</span>
                    <span className="font-bold">
                      {detailRow.documentsCompleted}/{detailRow.documentsTotal} documents ({detailRow.documentsPercent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getProgressColor(detailRow.documentsPercent)}`}
                      style={{ width: `${Math.min(100, Math.max(0, detailRow.documentsPercent))}%` }}
                    />
                  </div>
                </div>

                {/* Barre de sélection pour invalidation */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-muted-foreground">
                    Cochez les pièces à invalider ({selectedInvalidDocs.length} sélectionnée{selectedInvalidDocs.length > 1 ? 's' : ''}) :
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedInvalidDocs((detailRow.documents || []).map((d) => d.code))}
                    >
                      Tout sélectionner
                    </Button>
                    {selectedInvalidDocs.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedInvalidDocs([])}
                      >
                        Effacer
                      </Button>
                    )}
                  </div>
                </div>

                {/* Liste des 7 documents */}
                <div className="border rounded-lg divide-y">
                  {(detailRow.documents || []).map((doc) => {
                    const isChecked = selectedInvalidDocs.includes(doc.code);
                    return (
                      <div
                        key={doc.code}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-sm transition-colors ${
                          isChecked ? 'bg-red-50/70' : doc.invalidated ? 'bg-red-50/40' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleDocSelection(doc.code)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 accent-red-600 cursor-pointer shrink-0"
                            title="Sélectionner cette pièce pour l'invalider"
                          />
                          {doc.invalidated ? (
                            <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                          ) : doc.status === 'valid' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : doc.status === 'expired' ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium flex items-center gap-1.5 flex-wrap">
                              <span>{doc.label}</span>
                              {doc.invalidated && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Invalidée
                                </Badge>
                              )}
                            </div>
                            {doc.present ? (
                              <div className="text-xs text-muted-foreground truncate" title={repairAttachmentFileName(doc.name)}>
                                {repairAttachmentFileName(doc.name) || 'Document téléversé'}
                                {doc.expiryDate
                                  ? ` · Expire le ${new Date(doc.expiryDate).toLocaleDateString('fr-FR')}`
                                  : ''}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground italic">Non fourni</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {doc.status === 'valid' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" variant="outline">
                              Fourni
                            </Badge>
                          ) : doc.status === 'expired' ? (
                            <Badge variant="destructive">Expiré</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Manquant
                            </Badge>
                          )}
                          {doc.present && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={openingDocCode === doc.code}
                              onClick={() => handleOpenDocument(detailRow.hunter.id, doc)}
                              className="h-7 px-2 text-xs gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Voir
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Zone message au chasseur */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Message / Motif envoyé au chasseur (obligatoire en cas d&apos;invalidation, optionnel pour validation)
                  </label>
                  <Textarea
                    rows={3}
                    value={reviewMessage}
                    onChange={(e) => setReviewMessage(e.target.value)}
                    placeholder="Ex. : La photo de la pièce d'identité est floue / la quittance est expirée. Merci de téléverser un document lisible..."
                  />
                  {selectedInvalidDocs.length > 0 && !reviewMessage.trim() && (
                    <p className="text-xs text-red-600">
                      Saisissez un motif ci-dessus pour activer l&apos;invalidation des {selectedInvalidDocs.length} pièce(s) sélectionnée(s).
                    </p>
                  )}
                  {detailAnalysis.isSameInvalidationAlreadySent && (
                    <p className="text-xs text-muted-foreground">
                      Cette invalidation a déjà été enregistrée et transmise au chasseur. Modifiez les pièces cochées ou le motif pour renvoyer une nouvelle invalidation.
                    </p>
                  )}
                  {!detailRow.user && (
                    <p className="text-xs text-amber-700">
                      Attention : aucun compte utilisateur n&apos;est encore associé à ce chasseur (la décision sera enregistrée sans envoi de message).
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row flex-wrap gap-2 pt-2">
                <Button variant="outline" onClick={() => setDetailRow(null)} disabled={!!submittingReview}>
                  Fermer
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    !!submittingReview ||
                    selectedInvalidDocs.length === 0 ||
                    !reviewMessage.trim() ||
                    detailAnalysis.isSameInvalidationAlreadySent
                  }
                  onClick={handleInvalidateDossier}
                  className="gap-1.5"
                  title={
                    selectedInvalidDocs.length === 0
                      ? 'Cochez au moins une pièce à invalider'
                      : !reviewMessage.trim()
                      ? 'Saisissez un motif pour invalider'
                      : detailAnalysis.isSameInvalidationAlreadySent
                      ? 'Cette invalidation est déjà active'
                      : 'Invalider les pièces cochées et notifier le chasseur'
                  }
                >
                  <Send className="h-3.5 w-3.5" />
                  {submittingReview === 'invalidate'
                    ? 'Invalidation...'
                    : detailAnalysis.isSameInvalidationAlreadySent
                    ? `Déjà invalidé (${selectedInvalidDocs.length})`
                    : selectedInvalidDocs.length === (detailRow.documents || []).length && selectedInvalidDocs.length > 0
                    ? 'Invalider tout le dossier'
                    : `Invalider (${selectedInvalidDocs.length})`}
                </Button>
                <Button
                  type="button"
                  disabled={!!submittingReview || detailAnalysis.isAlreadyValidated}
                  onClick={handleValidateDossier}
                  className={`gap-1.5 text-white ${
                    detailAnalysis.isAlreadyValidated
                      ? 'bg-emerald-600/70'
                      : detailAnalysis.hasValidationAnomalies
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                  title={
                    detailAnalysis.isAlreadyValidated
                      ? 'Ce dossier est déjà validé'
                      : detailAnalysis.hasValidationAnomalies
                      ? 'Des pièces sont manquantes, expirées ou invalidées : une confirmation sera demandée'
                      : 'Valider le dossier complet'
                  }
                >
                  {detailAnalysis.hasValidationAnomalies && !detailAnalysis.isAlreadyValidated ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {submittingReview === 'validate'
                    ? 'Validation...'
                    : detailAnalysis.isAlreadyValidated
                    ? 'Dossier déjà validé'
                    : 'Valider le dossier'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation explicite si validation avec pièces manquantes / expirées / invalidées */}
      <AlertDialog open={confirmValidateOpen} onOpenChange={(open) => !submittingReview && setConfirmValidateOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Confirmer la validation malgré les anomalies ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Le dossier de{' '}
                  <strong className="text-foreground">
                    {detailRow?.hunter.firstName} {detailRow?.hunter.lastName}
                  </strong>{' '}
                  comporte encore les anomalies suivantes :
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-foreground">
                  {detailAnalysis.missingDocs.length > 0 && (
                    <li>
                      <strong>{detailAnalysis.missingDocs.length} pièce(s) manquante(s) :</strong>{' '}
                      {detailAnalysis.missingDocs.map((d) => d.label).join(', ')}
                    </li>
                  )}
                  {detailAnalysis.expiredDocs.length > 0 && (
                    <li>
                      <strong>{detailAnalysis.expiredDocs.length} pièce(s) expirée(s) :</strong>{' '}
                      {detailAnalysis.expiredDocs.map((d) => d.label).join(', ')}
                    </li>
                  )}
                  {detailAnalysis.invalidatedDocs.length > 0 && (
                    <li>
                      <strong>{detailAnalysis.invalidatedDocs.length} pièce(s) actuellement invalidée(s) :</strong>{' '}
                      {detailAnalysis.invalidatedDocs.map((d) => d.label).join(', ')}
                    </li>
                  )}
                  {detailAnalysis.checkedInvalidDocs.filter((d) => !d.invalidated).length > 0 && (
                    <li>
                      <strong>
                        {detailAnalysis.checkedInvalidDocs.filter((d) => !d.invalidated).length} pièce(s) cochée(s) pour invalidation :
                      </strong>{' '}
                      {detailAnalysis.checkedInvalidDocs
                        .filter((d) => !d.invalidated)
                        .map((d) => d.label)
                        .join(', ')}
                    </li>
                  )}
                </ul>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                  En confirmant, toutes les invalidations seront levées et le chasseur sera autorisé à déposer une demande de permis.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingReview === 'validate'}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={submittingReview === 'validate'}
              onClick={(e) => {
                e.preventDefault();
                void executeValidateDossier();
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submittingReview === 'validate' ? 'Validation...' : 'Confirmer la validation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Couper / Rétablir l'accès au compte */}
      <AlertDialog open={!!accessTarget} onOpenChange={(open) => !open && setAccessTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accessTarget?.nextActive ? "Rétablir l'accès au compte ?" : "Couper l'accès au compte ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accessTarget && (
                accessTarget.nextActive ? (
                  <>
                    Le compte <strong>@{accessTarget.row.user?.username}</strong> de{' '}
                    <strong>
                      {accessTarget.row.hunter.firstName} {accessTarget.row.hunter.lastName}
                    </strong>{' '}
                    sera réactivé dans le domaine Chasse.
                  </>
                ) : (
                  <>
                    Le compte <strong>@{accessTarget.row.user?.username}</strong> de{' '}
                    <strong>
                      {accessTarget.row.hunter.firstName} {accessTarget.row.hunter.lastName}
                    </strong>{' '}
                    sera suspendu et ne pourra plus se connecter tant que son accès ne sera pas rétabli.
                  </>
                )
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglingAccess}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={togglingAccess}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmToggleAccess();
              }}
              className={
                accessTarget?.nextActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              }
            >
              {togglingAccess
                ? 'Traitement...'
                : accessTarget?.nextActive
                ? "Rétablir l'accès"
                : "Couper l'accès"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Création d'accès dédié (pour anciens profils sans compte) */}
      <Dialog open={!!createAccessRow} onOpenChange={(open) => !open && setCreateAccessRow(null)}>
        <DialogContent className="max-w-md">
          {createAccessRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Créer un accès chasseur
                </DialogTitle>
                <DialogDescription>
                  Crée un compte utilisateur dédié pour{' '}
                  <strong>
                    {createAccessRow.hunter.firstName} {createAccessRow.hunter.lastName}
                  </strong>{' '}
                  avec le mot de passe par défaut <strong>chasse000</strong>.
                </DialogDescription>
              </DialogHeader>

              {createdCreds ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-2">
                  <div className="font-semibold text-emerald-900">Compte créé avec succès :</div>
                  <div>
                    <span className="text-muted-foreground">Nom d&apos;utilisateur : </span>
                    <strong className="font-mono">{createdCreds.username}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mot de passe par défaut : </span>
                    <strong className="font-mono">{createdCreds.password}</strong>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold block">Nom d&apos;utilisateur</label>
                  <Input
                    value={newAccessUsername}
                    onChange={(e) => setNewAccessUsername(e.target.value.replace(/\s+/g, ''))}
                    placeholder="Ex. : numéro de téléphone ou identifiant"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mot de passe attribué automatiquement : <strong>chasse000</strong>
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateAccessRow(null)}>
                  {createdCreds ? 'Fermer' : 'Annuler'}
                </Button>
                {!createdCreds && (
                  <Button
                    type="button"
                    disabled={creatingAccess || newAccessUsername.trim().length < 3}
                    onClick={handleCreateAccess}
                  >
                    {creatingAccess ? 'Création...' : 'Créer le compte'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

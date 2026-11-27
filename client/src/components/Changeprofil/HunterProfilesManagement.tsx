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
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  ShieldOff,
  Unlink,
  XCircle,
} from 'lucide-react';
import { LinkHunterProfile, LinkHunterTarget } from './LinkHunterProfile';

type HunterDocItem = {
  code: string;
  label: string;
  present: boolean;
  name?: string | null;
  expiryDate?: string | null;
  status: 'missing' | 'valid' | 'expired';
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
};

type FilterMode = 'all' | 'linked' | 'unlinked' | 'disabled';

function getProgressColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-600';
  if (percent >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function HunterProfilesManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [linkTarget, setLinkTarget] = useState<LinkHunterTarget | null>(null);
  const [detailRow, setDetailRow] = useState<HunterProfileRow | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<HunterProfileRow | null>(null);
  const [suspendOnUnlink, setSuspendOnUnlink] = useState(true);
  const [unlinking, setUnlinking] = useState(false);
  const [openingDocCode, setOpeningDocCode] = useState<string | null>(null);

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
    const linked = profiles.filter((p) => !!p.user).length;
    const unlinked = profiles.filter((p) => !p.user).length;
    const disabled = profiles.filter((p) => p.user && p.user.accessActive === false).length;
    return { all: profiles.length, linked, unlinked, disabled };
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

  const handleConfirmUnlink = async () => {
    if (!unlinkTarget?.user) return;
    try {
      setUnlinking(true);
      await apiRequest({
        url: '/api/admin/unlink-hunter-profile',
        method: 'POST',
        data: {
          userId: unlinkTarget.user.id,
          hunterId: unlinkTarget.hunter.id,
          suspendAccount: suspendOnUnlink,
        },
      });
      toast({
        title: 'Chasseur dissocié',
        description: suspendOnUnlink
          ? `Le profil de ${unlinkTarget.hunter.firstName} ${unlinkTarget.hunter.lastName} a été dissocié et l'accès au compte a été bloqué.`
          : `Le profil de ${unlinkTarget.hunter.firstName} ${unlinkTarget.hunter.lastName} a été dissocié du compte.`,
      });
      setUnlinkTarget(null);
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || 'Impossible de dissocier ce profil.',
        variant: 'destructive',
      });
    } finally {
      setUnlinking(false);
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
            onClick={() => setDetailRow(row.original)}
            className="w-full min-w-[140px] max-w-[190px] text-left group cursor-pointer"
            title="Cliquer pour voir le détail des documents"
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
        if (!u) {
          return <Badge variant="outline">Non associé</Badge>;
        }
        if (u.accessActive === false) {
          return (
            <Badge variant="destructive" className="gap-1 whitespace-nowrap">
              <ShieldOff className="h-3 w-3" />
              Compte désactivé
            </Badge>
          );
        }
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
            Associé
          </Badge>
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
              onClick={() => setDetailRow(item)}
              className="gap-1"
              title="Voir les documents du dossier"
            >
              <Eye className="h-3.5 w-3.5" />
              Dossier
            </Button>
            {!item.user ? (
              <Button
                size="sm"
                onClick={() =>
                  setLinkTarget({
                    hunter: item.hunter,
                    region: item.region,
                    zone: item.zone,
                    documentsCompleted: item.documentsCompleted ?? 0,
                    documentsTotal: item.documentsTotal ?? 7,
                    documentsPercent: item.documentsPercent ?? 0,
                  })
                }
                className="gap-1"
              >
                <Link2 className="h-3.5 w-3.5" />
                Associer
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setSuspendOnUnlink(item.user?.accessActive !== false);
                  setUnlinkTarget(item);
                }}
                className="gap-1"
                title="Dissocier le chasseur de ce compte"
              >
                <Unlink className="h-3.5 w-3.5" />
                Dissocier
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
      if (filterMode === 'linked' && !profile.user) return false;
      if (filterMode === 'unlinked' && profile.user) return false;
      if (filterMode === 'disabled' && !(profile.user && profile.user.accessActive === false)) return false;

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
            Suivi du remplissage des dossiers, association et contrôle d&apos;accès aux comptes
          </p>
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Input
            placeholder="Rechercher (nom, téléphone, compte, région)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72"
          />
        </div>
      </div>

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
          variant={filterMode === 'linked' ? 'default' : 'outline'}
          onClick={() => setFilterMode('linked')}
        >
          Associés ({counts.linked})
        </Button>
        <Button
          size="sm"
          variant={filterMode === 'unlinked' ? 'default' : 'outline'}
          onClick={() => setFilterMode('unlinked')}
        >
          Non associés ({counts.unlinked})
        </Button>
        <Button
          size="sm"
          variant={filterMode === 'disabled' ? 'destructive' : 'outline'}
          onClick={() => setFilterMode('disabled')}
        >
          Comptes désactivés ({counts.disabled})
        </Button>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardContent className="p-3 sm:p-6 min-w-0">
          <div className="w-full overflow-x-auto">
            <DataTable columns={columns as any} data={filteredData as any} />
          </div>
        </CardContent>
      </Card>

      {/* Modal Association (sans ID techniques) */}
      <LinkHunterProfile
        open={!!linkTarget}
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        onSuccess={() => refetch()}
      />

      {/* Modal Détail du Dossier & Documents */}
      <Dialog open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent hideClose className="max-w-xl max-h-[90vh] overflow-y-auto">
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

                {/* Liste des 7 documents */}
                <div className="border rounded-lg divide-y">
                  {(detailRow.documents || []).map((doc) => (
                    <div
                      key={doc.code}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-sm"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {doc.status === 'valid' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : doc.status === 'expired' ? (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium">{doc.label}</div>
                          {doc.present ? (
                            <div className="text-xs text-muted-foreground truncate">
                              {doc.name || 'Document téléversé'}
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
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailRow(null)}>
                  Fermer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation de dissociation / refus d'accès */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => !open && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dissocier ce chasseur du compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinkTarget && (
                <>
                  Le profil de{' '}
                  <strong>
                    {unlinkTarget.hunter.firstName} {unlinkTarget.hunter.lastName}
                  </strong>{' '}
                  sera détaché du compte <strong>@{unlinkTarget.user?.username}</strong>. Ce compte n&apos;aura plus accès au dossier chasseur.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {unlinkTarget?.user && (
            <label className="flex items-start gap-2.5 rounded-md border p-3 text-sm cursor-pointer bg-muted/30">
              <input
                type="checkbox"
                checked={suspendOnUnlink}
                onChange={(e) => setSuspendOnUnlink(e.target.checked)}
                className="mt-1 rounded border-input"
              />
              <span>
                <span className="font-medium block">Refuser également la connexion au compte utilisateur</span>
                <span className="text-xs text-muted-foreground">
                  Désactive et suspend le compte @{unlinkTarget.user.username} dans le domaine Chasse.
                </span>
              </span>
            </label>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={unlinking}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmUnlink();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinking ? 'Dissociation...' : 'Confirmer la dissociation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

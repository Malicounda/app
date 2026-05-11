import PermitDetails from "@/components/permits/PermitDetails";
import PermitForm from "@/components/permits/PermitForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHunters } from "@/lib/hooks/useHunters";
import { usePermits } from "@/lib/hooks/usePermits";
import { isPermitExpired, isPermitSuspended } from "@/lib/utils/permits";
import { isSectorSubRole } from "@/utils/navigation";
import { generatePdf } from "@/utils/pdfGenerator";
import { format } from "date-fns";
import { BookPlus, BookText, FileDown, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
// Tabs removed: only sector view remains
import { Badge } from "@/components/ui/badge";
// Location routing not needed for single view

// Type pour les permis (ajustez selon votre schema)
interface Permit {
  id: number;
  permitNumber: string;
  hunterId: number;
  issueDate: string;
  expiryDate: string;
  status: string;
  price: number;
  type?: string;
  area?: string;
  zone?: string;
}

// Type pour les chasseurs
interface Hunter {
  id: number;
  firstName: string;
  lastName: string;
  idNumber: string;
}

export default function SectorPermits() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPermitId, setSelectedPermitId] = useState<number | null>(null);
  // Tabs removed; always sector view

  const { allPermits, isLoading: permitsLoading, error: permitsError } = usePermits();
  const { allHunters: hunters, huntersLoading, error: huntersError } = useHunters();

  // Debug logs pour diagnostiquer le problème
  console.log('[SectorPermits] Debug des données:', {
    permits: Array.isArray(allPermits) ? allPermits.length : 0,
    permitsLoading,
    permitsError
  });

  const isLoading = permitsLoading || huntersLoading;
  const error = permitsError || huntersError;

  // Helpers
  const getEffectiveExpiry = (p: any) => (p?.computedEffectiveExpiry || p?.expiryDate || null);
  const isExpiredDerived = (p: any) => {
    const ee = getEffectiveExpiry(p);
    if (!ee) return false;
    const d = new Date(ee);
    return !isNaN(d.getTime()) && d < new Date();
  };
  const getHunterById = (hunterId: number) => {
    const h = hunters?.find((hh: Hunter) => hh.id === hunterId);
    return h ? { firstName: h.firstName, lastName: h.lastName, idNumber: (h as any)?.idNumber || '' } : { firstName: '', lastName: '', idNumber: '' };
    };
  const computeIssuerServiceLocation = (permit: any) => {
    const role = (permit.issuerRole || user?.type || (user?.role === 'agent' ? 'regional' : (isSectorSubRole(user?.role) ? 'secteur' : user?.role)) || '').toLowerCase();
    const region = (permit.issuerRegion || user?.region || '').toString().trim();
    const zone = (permit.issuerZone || (user as any)?.zone || '').toString().trim();
    const dept = ((permit as any).issuerDepartement || (user as any)?.departement || '').toString().trim();
    if (role === 'admin') return 'Service des Eaux et Forêts DEFCCS';
    const isRegional = role.includes('region');
    const isSector = role.includes('secteur') || role.includes('sector') || isSectorSubRole(role);
    if (isRegional) {
      return region ? `IREF/${region}` : 'IREF';
    }
    if (isSector) {
      if (dept) return `Secteur/${dept}`;
      if (zone) return `Secteur/${zone}`;
      return 'Secteur/Non défini';
    }
    if (dept) return `Secteur/${dept}`;
    if (zone) return `Secteur/${zone}`;
    return region ? `IREF/${region}` : '';
  };

  // Filtrer les permis en fonction de la recherche et de l'onglet actif
  const filteredPermits = useMemo(() => {
    const permitsToFilter: Permit[] = Array.isArray(allPermits)
      ? (allPermits as any[]).map((p) => ({
          ...p,
          price: typeof p.price === 'string' ? Number(p.price) : p.price,
        }))
      : [];
    if (!searchTerm) return permitsToFilter;
    const searchLower = searchTerm.toLowerCase();
    return permitsToFilter.filter((permit: Permit) => {
      const hunter = hunters?.find((h: Hunter) => h.id === permit.hunterId);
      return (
        permit.permitNumber.toLowerCase().includes(searchLower) ||
        hunter?.firstName?.toLowerCase().includes(searchLower) ||
        hunter?.lastName?.toLowerCase().includes(searchLower) ||
        hunter?.idNumber?.toLowerCase().includes(searchLower)
      );
    });
  }, [allPermits, searchTerm, hunters]);

  // Compter les différents types de permis
  const permitCounts = useMemo(() => {
    const permitsToCount: Permit[] = Array.isArray(allPermits)
      ? (allPermits as any[]).map((p) => ({
          ...p,
          price: typeof p.price === 'string' ? Number(p.price) : p.price,
        }))
      : [];
    const active = permitsToCount.filter((p: any) => !isPermitSuspended(p) && !(isExpiredDerived(p) || isPermitExpired(p))).length;
    const expired = permitsToCount.filter((p: any) => isExpiredDerived(p) || isPermitExpired(p)).length;
    const suspended = permitsToCount.filter(isPermitSuspended).length;
    return { active, expired, suspended, total: permitsToCount.length };
  }, [allPermits]);

  // Générer un PDF des permis
  const exportPermitsList = () => {
    toast({
      title: "Export en cours",
      description: "La liste des permis est en cours d'exportation au format PDF.",
    });

    const permitsList = filteredPermits.map((permit: Permit) => {
      const hunter = hunters?.find((h: Hunter) => h.id === permit.hunterId);
      const effExpiry = getEffectiveExpiry(permit as any);
      const status = isPermitSuspended(permit) ? 'Suspendu' : ((isExpiredDerived(permit) || isPermitExpired(permit)) ? 'Expiré' : 'Actif');
      return {
        'Numéro': permit.permitNumber,
        'Titulaire': hunter ? `${hunter.firstName} ${hunter.lastName}` : 'Inconnu',
        'Date émission': format(new Date(permit.issueDate), 'dd/MM/yyyy'),
        'Date expiration': effExpiry ? format(new Date(effExpiry), 'dd/MM/yyyy') : '',
        'Statut': status,
        'Type': permit.type || '-',
        'Département': permit.zone || '-'
      } as const;
    });

    const columns = Object.keys(permitsList[0] || {});
    const body = permitsList.map((row) => columns.map((c) => (row as any)[c]));

    generatePdf({
      title: "Permis de Chasse - Secteur",
      filename: "permis-secteur.pdf",
      tableColumns: columns,
      tableData: body,
    });
    toast({
      title: "Export terminé",
      description: "La liste des permis a été exportée avec succès.",
    });
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Permis</h1>
          <p className="text-muted-foreground">Consultez et gérez les permis de chasse dans votre secteur.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total des permis</p>
              <h4 className="text-2xl font-bold">{permitCounts.total}</h4>
            </div>
            <BookText className="h-8 w-8 text-primary opacity-80" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Permis actifs</p>
              <h4 className="text-2xl font-bold">{permitCounts.active}</h4>
            </div>
            <Badge variant="default" className="text-xl px-3 py-1">
              {permitCounts.active}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Permis expirés</p>
              <h4 className="text-2xl font-bold">{permitCounts.expired}</h4>
            </div>
            <Badge variant="secondary" className="text-xl px-3 py-1">
              {permitCounts.expired}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Permis suspendus</p>
              <h4 className="text-2xl font-bold">{permitCounts.suspended}</h4>
            </div>
            <Badge variant="destructive" className="text-xl px-3 py-1">
              {permitCounts.suspended}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <CardTitle>Permis que vous avez délivrés</CardTitle>
              <div className="flex space-x-2 mt-2 md:mt-0">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un permis..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {(user && ["admin","agent","sub-agent","brigade","triage","poste-control","sous-secteur"].includes(user.role)) && (
                  <Button onClick={() => setShowAddForm(true)}>
                    <BookPlus className="h-4 w-4 mr-2" />
                    Ajouter un Permis
                  </Button>
                )}
                <Button variant="outline" onClick={exportPermitsList}>
                  <Printer className="h-4 w-4 mr-2" />
                  Exporter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-32">
                <p>Chargement des permis...</p>
              </div>
            ) : error ? (
              <div className="flex justify-center items-center h-32">
                <p className="text-destructive">
                  Erreur lors du chargement des permis. Veuillez réessayer.
                </p>
              </div>
            ) : filteredPermits.length === 0 ? (
              <div className="flex justify-center items-center h-32">
                <p>Doit contenir la liste des permis délivrés par le secteur.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">N° Permis</th>
                      <th className="text-left py-2 px-2">Chasseur</th>
                      <th className="text-left py-2 px-2">Informations</th>
                      <th className="text-left py-2 px-2">Date émission</th>
                      <th className="text-left py-2 px-2">Date expiration</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Statut</th>
                      <th className="text-left py-2 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPermits.map((permit: Permit) => {
                      const hunter = hunters?.find((h: Hunter) => h.id === permit.hunterId);
                      return (
                        <tr key={permit.id} className="border-b">
                          <td className="py-2 px-2">{permit.permitNumber}</td>
                          <td className="py-2 px-2">
                            {hunter ? `${hunter.firstName} ${hunter.lastName}` : "Inconnu"}
                          </td>
                          <td className="py-2 px-2 text-[12px] md:text-sm text-gray-700">
                            <div className="flex flex-col">
                              <span><strong>N° ID:</strong> {getHunterById(permit.hunterId).idNumber || '-'}</span>
                              <span className="mt-0.5"><strong>Émetteur:</strong> {computeIssuerServiceLocation(permit) || '-'}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            {format(new Date(permit.issueDate), 'dd/MM/yyyy')}
                          </td>
                          <td className="py-2 px-2">
                            {(() => { const ee = getEffectiveExpiry(permit as any); return ee ? format(new Date(ee), 'dd/MM/yyyy') : ''; })()}
                          </td>
                          <td className="py-2 px-2">{permit.type || "Standard"}</td>
                          <td className="py-2 px-2">
                            {(() => {
                              const suspended = isPermitSuspended(permit);
                              const expired = isExpiredDerived(permit) || isPermitExpired(permit);
                              const variant = suspended ? 'destructive' : (expired ? 'secondary' : 'default');
                              const label = suspended ? 'Suspendu' : (expired ? 'Expiré' : 'Actif');
                              return <Badge variant={variant as any}>{label}</Badge>;
                            })()}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedPermitId(permit.id)}
                              >
                                <Search className="h-4 w-4 mr-1" />
                                Détails
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  toast({
                                    title: "Téléchargement du permis",
                                    description: "Le permis est en cours de téléchargement.",
                                  });
                                }}
                              >
                                <FileDown className="h-4 w-4 mr-1" />
                                PDF
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    {selectedPermitId && (
      <PermitDetails
        permitId={selectedPermitId}
        open={!!selectedPermitId}
        onClose={() => setSelectedPermitId(null)}
      />
    )}

    {/* Formulaire d'ajout de permis */}
    <PermitForm
      open={showAddForm}
      onClose={() => setShowAddForm(false)}
    />
  </div>
);
}

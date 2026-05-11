import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import { useMemo, useState } from "react";

type Affectation = {
  id: number;
  agentId: number;
  domaineId: number;
  agentMatricule?: string | null;
  domaineNom?: string | null;
  niveauHierarchique: "NATIONAL" | "REGIONAL" | "SECTEUR";
  roleMetierId?: number | null;
  codeZone: string;
  active: boolean;
  dateAffectation?: string | null;
};

type Domaine = {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function AffectationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/affectations"],
    queryFn: () => apiRequest<Affectation[]>({ url: "/api/affectations", method: "GET" }),
  });

  const { data: domainesData, isLoading: isLoadingDomaines } = useQuery({
    queryKey: ["/api/domaines"],
    queryFn: () => apiRequest<Domaine[]>({ url: "/api/domaines", method: "GET" }),
  });

  const affectations = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const domaines = useMemo(() => (Array.isArray(domainesData) ? domainesData : []), [domainesData]);

  const [searchMatricule, setSearchMatricule] = useState("");

  const filtered = useMemo(() => {
    const q = searchMatricule.trim().toLowerCase();
    if (!q) return affectations;
    return affectations.filter((a) => String(a.agentMatricule || "").toLowerCase().includes(q));
  }, [affectations, searchMatricule]);

  const pagination = usePagination(filtered, { pageSize: 10 });

  const [agentId, setAgentId] = useState("");
  const [domaineId, setDomaineId] = useState("");
  const [codeZone, setCodeZone] = useState("");
  const [niveauHierarchique, setNiveauHierarchique] = useState<Affectation["niveauHierarchique"]>("REGIONAL");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<Affectation>({
        url: "/api/affectations",
        method: "POST",
        data: {
          agentId: Number(agentId),
          domaineId: Number(domaineId),
          niveauHierarchique,
          codeZone,
        },
      });
    },
    onSuccess: async () => {
      setAgentId("");
      setDomaineId("");
      setCodeZone("");
      await qc.invalidateQueries({ queryKey: ["/api/affectations"] });
      toast({ title: "Affectation créée" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Création impossible", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (vars: { id: number; active: boolean }) => {
      return apiRequest<Affectation>({ url: `/api/affectations/${vars.id}/active/${vars.active ? "true" : "false"}`, method: "PATCH" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/affectations"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Mise à jour impossible", variant: "destructive" });
    },
  });

  return (
    <main className="page-frame-container">
      <div className="page-frame-inner container mx-auto px-4 py-4 space-y-4 max-w-6xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Contrôle des Affectations</h2>
          <div className="text-sm text-muted-foreground">Administration centrale - Affectations</div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Créer une affectation</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="1" />
            </div>
            <div className="space-y-2">
              <Label>Domaine</Label>
              <Select value={domaineId} onValueChange={(v) => setDomaineId(v)} disabled={isLoadingDomaines}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingDomaines ? "Chargement..." : "Sélectionner"} />
                </SelectTrigger>
                <SelectContent>
                  {domaines.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.nomDomaine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Niveau</Label>
              <Select value={niveauHierarchique} onValueChange={(v) => setNiveauHierarchique(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NATIONAL">NATIONAL</SelectItem>
                  <SelectItem value="REGIONAL">REGIONAL</SelectItem>
                  <SelectItem value="SECTEUR">SECTEUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Code zone</Label>
              <Input value={codeZone} onChange={(e) => setCodeZone(e.target.value)} placeholder="DAKAR" />
            </div>
            <div className="md:col-span-4">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !agentId || !domaineId || !codeZone}
              >
                Créer
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liste ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full md:max-w-sm mb-4">
              <Input
                placeholder="Rechercher par matricule"
                value={searchMatricule}
                onChange={(e) => {
                  setSearchMatricule(e.target.value);
                  pagination.setPage(1);
                }}
              />
            </div>

            {isLoading ? (
              <div className="py-6">Chargement...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Domaine</TableHead>
                    <TableHead>Niveau</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="w-[180px]">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.currentItems.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <User className="h-4 w-4 text-green-600" />
                      </TableCell>
                      <TableCell>{a.agentMatricule || "-"}</TableCell>
                      <TableCell>{a.domaineNom || "-"}</TableCell>
                      <TableCell>{a.niveauHierarchique}</TableCell>
                      <TableCell>{a.codeZone}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={a.active ? "secondary" : "outline"}
                            className={a.active ? "bg-green-100 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}
                          >
                            {a.active ? "Actif" : "Inactif"}
                          </Badge>
                          <Switch
                            checked={!!a.active}
                            onCheckedChange={(next) => toggleMutation.mutate({ id: a.id, active: next })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!isLoading && (
              <div className="mt-4 flex items-center justify-center gap-4">
                  <Button variant="outline" onClick={() => pagination.prevPage()} disabled={pagination.page <= 1}>
                    Précédent
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {pagination.page} / {pagination.pageCount}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => pagination.nextPage()}
                    disabled={pagination.page >= pagination.pageCount}
                  >
                    Suivant
                  </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

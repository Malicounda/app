import AddReforestationSectorAgentForm from "@/components/reboisement/AddReforestationSectorAgentForm";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, FileText, Lock, Map as MapIcon, MapPin, MoreHorizontal, Sprout, Trash2, TreePine, UserPlus, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

const SplitCardContent = ({ total, label1, value1, label2, value2 }: { total: number | string, label1: string, value1: number | string, label2: string, value2: number | string }) => (
  <div className="flex flex-col w-full space-y-3">
    <div className="text-3xl font-bold text-gray-900 text-center">{total}</div>
    <div className="border rounded-md overflow-hidden bg-gray-50/50">
      <div className="grid grid-cols-2 border-b bg-gray-100/50">
        <div className="text-[10px] uppercase tracking-wider font-bold text-green-800 py-1 text-center border-r">{label1}</div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-green-800 py-1 text-center">{label2}</div>
      </div>
      <div className="grid grid-cols-2 bg-white">
        <div className="text-lg font-bold text-gray-800 py-1 text-center border-r">{value1}</div>
        <div className="text-lg font-bold text-gray-800 py-1 text-center">{value2}</div>
      </div>
    </div>
  </div>
);

export default function ReforestationRegionalDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const [isAddSubAccountDialogOpen, setIsAddSubAccountDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Interfaces pour les données reboisement
  interface RegionalReforestationStats {
    totalAgents: number;
    activeNurseries: number;
    regieNurseries: number;
    otherNurseries: number;
    totalPlants: number;
    regiePlants: number;
    otherPlants: number;
    totalProjects: number;
    plantedTrees: number;
    survivalRate: number;
    pendingReports: number;
    recentActivities?: unknown[];
  }

  const region = user?.region || "";

  // Récupérer les statistiques de la région pour le reboisement
  const { data: regionalStats } = useQuery({
    queryKey: ["/api/reboisement/stats/regional", region],
    queryFn: () => apiRequest({
      url: `/api/reboisement/stats/regional`,
      method: "GET",
    }),
    enabled: !!region,
  });

  // Agents de secteur de la région de l'agent régional reboisement
  const { data: sectorAgents } = useQuery({
    queryKey: ["/api/reboisement/regional/my-sector-agents"],
    queryFn: () => apiRequest({
      url: "/api/reboisement/regional/my-sector-agents",
      method: "GET",
    }),
    enabled: !!user,
  });

  const rs = (regionalStats as any) || {};
  const dashboard: Partial<RegionalReforestationStats> = {
    totalAgents: Number(rs.totalAgents) || 0,
    activeNurseries: Number(rs.activeNurseries) || 0,
    regieNurseries: Number(rs.regieNurseries) || 0,
    otherNurseries: Number(rs.otherNurseries) || 0,
    totalPlants: Number(rs.totalPlants) || 0,
    regiePlants: Number(rs.regiePlants) || 0,
    otherPlants: Number(rs.otherPlants) || 0,
    totalProjects: Number(rs.totalProjects) || 0,
    plantedTrees: Number(rs.plantedTrees) || 0,
    survivalRate: Number(rs.survivalRate) || 0,
    pendingReports: Number(rs.pendingReports) || 0,
  };

  const visibleSectorAgents = useMemo(() => {
    const list = Array.isArray(sectorAgents) ? (sectorAgents as any[]) : [];
    const myId = (user as any)?.id;
    return list.filter((a) => {
      if (!a) return false;
      // Ne jamais afficher l'agent régional connecté dans la liste des agents secteur
      if (myId != null && String(a.id) === String(myId)) return false;
      // Protéger l'UI si le backend renvoie par erreur d'autres rôles
      if (String(a.role || '').toLowerCase() !== 'sub-agent') return false;
      return true;
    });
  }, [sectorAgents, user]);

  const regionalAgentsCount = visibleSectorAgents.length;

  const formatNumber = (n: number) => `${Number(n || 0).toLocaleString('fr-FR')}`;
  const formatDate = (d: string | Date | undefined) => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  // Charger les activités récentes de reboisement
  const { data: recentActivities } = useQuery({
    queryKey: ["/api/reboisement/activities", region],
    queryFn: () => apiRequest({ url: `/api/reboisement/activities`, method: "GET" }),
    enabled: !!region,
  });
  const activities: any[] = Array.isArray(recentActivities)
    ? (recentActivities as any[]).slice(0, 5)
    : [];

  return (
    <div className="px-6 py-8">
      <div className="mb-8">
        <div className="bg-green-50 border-l-4 border-green-400 rounded-xl px-6 py-4 shadow-sm flex flex-col gap-2">
          <div className="flex flex-row items-center gap-3">
            <h1 className="text-3xl font-bold text-green-900">Espace Agent Régional</h1>
            <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-lg ml-2">Division REBOISEMENT</span>
          </div>
          <div className="mt-1 text-lg">
            <span className="font-semibold text-green-900 uppercase">{user?.firstName} {user?.lastName}</span>
            <span className="mx-2 text-green-700">|</span>
            <span className="text-green-700">Région: <span className="font-bold lowercase text-green-800">{user?.region || "Non définie"}</span></span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 w-full">
        {/* Pépinières actives */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pépinières actives</CardTitle>
            <Sprout className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <SplitCardContent
              total={dashboard.activeNurseries ?? 0}
              label1="Régie"
              value1={dashboard.regieNurseries ?? 0}
              label2="Autre"
              value2={dashboard.otherNurseries ?? 0}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              En fonctionnement dans la région
            </p>
          </CardContent>
        </Card>

        {/* Nombre de plants */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nombre de plants</CardTitle>
            <TreePine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <SplitCardContent
              total={formatNumber(dashboard.totalPlants ?? 0)}
              label1="Régie"
              value1={formatNumber(dashboard.regiePlants ?? 0)}
              label2="Autre"
              value2={formatNumber(dashboard.otherPlants ?? 0)}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Production totale de la région
            </p>
          </CardContent>
        </Card>

        {/* Réalisations terrain */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Réalisations terrain</CardTitle>
            <MapIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-1 gap-2 mt-1">
                <div className="flex justify-between items-center text-sm border-b pb-1">
                   <span className="text-muted-foreground text-xs uppercase font-semibold">Plants attribués</span>
                   <span className="font-bold text-emerald-700">{formatNumber((dashboard as any).totalAttributedPlants ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b pb-1">
                   <span className="text-muted-foreground text-xs uppercase font-semibold">Linéaire (km)</span>
                   <span className="font-bold text-emerald-700">{formatNumber((dashboard as any).totalLinearKm ?? 0)} km</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1">
                   <span className="text-muted-foreground text-xs uppercase font-semibold">Massif (ha)</span>
                   <span className="font-bold text-emerald-700">{formatNumber((dashboard as any).totalMassifHa ?? 0)} ha</span>
                </div>
             </div>
             <p className="text-[10px] text-muted-foreground mt-3 italic">
               Basé sur les demandes et réalisations validées
             </p>
          </CardContent>
        </Card>
      </div>



      {/* Liste des Agents de Secteur */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6 text-emerald-700" />
              Agents de Secteur ({regionalAgentsCount})
            </CardTitle>
            <CardDescription>Gérez les agents rattachés aux secteurs de votre région</CardDescription>
          </div>
          <Button
            ref={addButtonRef}
            onClick={() => setIsAddSubAccountDialogOpen(true)}
            className="bg-emerald-700 hover:bg-emerald-800"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Ajouter un Agent
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Secteur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSectorAgents.length > 0 ? (
                  visibleSectorAgents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
                              {agent.firstName?.[0]}{agent.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span>{agent.grade && agent.grade !== "Non défini" ? `${agent.grade} ` : ""}{agent.firstName} {agent.lastName}</span>
                        </div>
                      </TableCell>
                      <TableCell>{agent.genre || "Non défini"}</TableCell>
                      <TableCell>{agent.matricule || "N/A"}</TableCell>
                      <TableCell>{agent.phone}</TableCell>
                      <TableCell className="lowercase text-slate-500">{agent.email}</TableCell>
                      <TableCell className="capitalize">{agent.departement || "Non défini"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Actif
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(agent);
                              setNewPassword("");
                              setShowPassword(false);
                              setIsResetPasswordDialogOpen(true);
                            }}>
                              <Lock className="mr-2 h-4 w-4" /> Mot de passe
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => {
                                setSelectedUser(agent);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      Aucun agent de secteur trouvé
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Formulaires et Dialogues */}
      <AddReforestationSectorAgentForm
        open={isAddSubAccountDialogOpen}
        onClose={() => setIsAddSubAccountDialogOpen(false)}
        triggerRef={addButtonRef}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'agent ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'agent {selectedUser?.firstName} {selectedUser?.lastName} n'aura plus accès au système.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                try {
                  await apiRequest({ url: `/api/users/${selectedUser.id}`, method: "DELETE" });
                  toast({ title: "Succès", description: "Agent supprimé" });
                  queryClient.invalidateQueries({ queryKey: ["/api/reboisement/regional/my-sector-agents"] });
                } catch (e) {
                  toast({ variant: "destructive", title: "Erreur", description: "Échec de la suppression" });
                } finally {
                  setIsDeleteDialogOpen(false);
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau mot de passe</DialogTitle>
            <DialogDescription>Changer le mot de passe de {selectedUser?.username}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="pass">Mot de passe</Label>
            <div className="relative">
              <Input
                id="pass"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 caractères"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)}>Annuler</Button>
            <Button
              className="bg-emerald-700 hover:bg-emerald-800"
              onClick={async () => {
                if (newPassword.length < 6) return toast({ variant: "destructive", title: "Trop court" });
                try {
                  await apiRequest({ url: `/api/users/${selectedUser.id}`, method: "PUT", data: { password: newPassword } });
                  toast({ title: "Succès", description: "Mot de passe mis à jour" });
                  setIsResetPasswordDialogOpen(false);
                } catch (e) {
                  toast({ variant: "destructive", title: "Erreur" });
                }
              }}
            >
              Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Actions rapides */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 mt-8 w-full pb-8">
        <Link href="/reboisement/reports">
          <Card className="hover:bg-emerald-50 cursor-pointer transition-colors border-l-4 border-l-emerald-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rapports de Quinzaine</CardTitle>
              <FileText className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Consolider et valider les rapports des agents de secteur</p>
            </CardContent>
          </Card>
        </Link>

        <Card className="hover:bg-emerald-50 cursor-pointer transition-colors border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cartographie Régionale</CardTitle>
            <MapPin className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Visualiser les pépinières et zones de plantation</p>
          </CardContent>
        </Card>

        <Card className="hover:bg-emerald-50 cursor-pointer transition-colors border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validation de Demandes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Traiter les demandes de plants en attente</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

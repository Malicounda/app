import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Flag, Info, Pencil, Trash2, User, Download, Upload } from "lucide-react";
import { useMemo, useState, useRef } from "react";
import Papa from "papaparse";

type AgentRow = {
  idAgent: number | null;
  userId: number;
  matriculeSol: string;
  nom: string | null;
  prenom: string | null;
  grade: string | null;
  genre?: string | null;
  roleMetierId: number | null;
  roleMetierLabel: string | null;
  contact: any;
  createdAt: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  region: string | null;
  departement: string | null;
  commune: string | null;
  arrondissement: string | null;
  userRole: string | null;
  adminDomainName?: string | null;
};

type RoleMetier = {
  id: number;
  code: string;
  labelFr: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
};

type AgentGradeOption = {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
};

function feminizeGrade(raw: string) {
  const v = String(raw || "").trim();
  if (!v) return v;

  const map: Record<string, string> = {
    "Lieutenant": "Lieutenante",
    "Sous-Lieutenant": "Sous-Lieutenante",
    "Capitaine": "Capitaine",
    "Commandant": "Commandante",
    "Colonel": "Colonelle",
    "Lieutenant Colonel": "Lieutenante-Colonelle",
    "Lieutenant-colonel": "Lieutenante-Colonelle",
    "General": "Générale",
    "Général": "Générale",
    "Sous-Lieutenantant": "Sous-Lieutenante",
  };

  return map[v] || v;
}

function normalizeNom(raw: string) {
  return String(raw || "").trim().toUpperCase();
}

function capitalizeWords(raw: string, delimiterRegex: RegExp, joinWith: string) {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return "";
  return cleaned
    .split(delimiterRegex)
    .filter((p) => p !== "")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(joinWith);
}

function normalizePrenom(raw: string) {
  // Chaque mot commence par une majuscule, séparé par espaces
  return capitalizeWords(raw, /\s+/, " ");
}

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/\D/g, "");
  const truncated = numbers.slice(0, 9);
  if (truncated.length <= 2) return truncated;
  if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
  if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
  return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
}

function GradeSelectField({
  value,
  onChange,
  disabled,
  options,
  triggerClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: AgentGradeOption[];
  triggerClassName?: string;
}) {
  const current = value?.trim() || "";
  const selectValue =
    current && options.some((g) => g.label === current) ? current : current ? `__custom:${current}` : "none";
  const hasCustom = current && !options.some((g) => g.label === current);

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v === "none") onChange("");
        else if (v.startsWith("__custom:")) onChange(v.slice("__custom:".length));
        else onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="Sélectionner un grade" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Aucun</SelectItem>
        {options.map((g) => (
          <SelectItem key={g.id} value={g.label}>
            {g.label}
          </SelectItem>
        ))}
        {hasCustom && <SelectItem value={`__custom:${current}`}>{current}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

export default function SuperAdminAgentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest<AgentRow[]>({ url: "/api/agents", method: "GET" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (idAgent: number) => {
      return apiRequest<any>({
        url: `/api/agents/${idAgent}`,
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Suppression impossible", variant: "destructive" });
    },
  });

  const { data: rolesMetierData } = useQuery({
    queryKey: ["/api/roles-metier"],
    queryFn: () => apiRequest<RoleMetier[]>({ url: "/api/roles-metier", method: "GET" }),
  });

  const { data: gradesData } = useQuery({
    queryKey: ["/api/agent-grades"],
    queryFn: () => apiRequest<AgentGradeOption[]>({ url: "/api/agent-grades", method: "GET" }),
  });

  const gradeOptions = useMemo(
    () => (Array.isArray(gradesData) ? gradesData.filter((g) => g.isActive) : []),
    [gradesData]
  );

  const { data: departementsFeature } = useQuery({
    queryKey: ["/api/departements"],
    queryFn: () => apiRequest<any>({ url: "/api/departements", method: "GET" }),
  });
  const departementsList = departementsFeature?.features || [];

  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : [];

    // Déduplication par userId: on garde la ligne la plus complète (celle qui a idAgent)
    const byUserId = new Map<number, any>();
    for (const r of list as any[]) {
      const uid = Number(r?.userId);
      if (!Number.isFinite(uid)) continue;
      const existing = byUserId.get(uid);
      if (!existing) {
        byUserId.set(uid, r);
        continue;
      }

      const existingHasAgent = !!existing?.idAgent;
      const currentHasAgent = !!r?.idAgent;
      if (!existingHasAgent && currentHasAgent) {
        byUserId.set(uid, r);
        continue;
      }
    }

    return Array.from(byUserId.values());
  }, [data]);
  const rolesMetier = useMemo(
    () => (Array.isArray(rolesMetierData) ? rolesMetierData : []).filter((r) => r.isActive),
    [rolesMetierData]
  );

  const [searchMatricule, setSearchMatricule] = useState("");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterDepartement, setFilterDepartement] = useState("all");
  const [filterArrondissement, setFilterArrondissement] = useState("all");
  const [filterCommune, setFilterCommune] = useState("all");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const uniqueRegions = useMemo(() => Array.from(new Set(rows.map(r => r.region).filter(Boolean))).sort(), [rows]);
  const uniqueDepartements = useMemo(() => Array.from(new Set(rows.map(r => r.departement).filter(Boolean))).sort(), [rows]);
  const uniqueArrondissements = useMemo(() => Array.from(new Set(rows.map(r => r.arrondissement).filter(Boolean))).sort(), [rows]);
  const uniqueCommunes = useMemo(() => Array.from(new Set(rows.map(r => r.commune).filter(Boolean))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;
    const q = searchMatricule.trim().toLowerCase();
    
    if (q) {
      result = result.filter((r) => String(r.matriculeSol || "").toLowerCase().includes(q));
    }
    if (filterRegion !== "all") result = result.filter(r => r.region === filterRegion);
    if (filterDepartement !== "all") result = result.filter(r => r.departement === filterDepartement);
    if (filterArrondissement !== "all") result = result.filter(r => r.arrondissement === filterArrondissement);
    if (filterCommune !== "all") result = result.filter(r => r.commune === filterCommune);
    
    return result;
  }, [rows, searchMatricule, filterRegion, filterDepartement, filterArrondissement, filterCommune]);

  const adminRows = useMemo(
    () => filteredRows.filter((r: any) => String(r?.userRole || "").toLowerCase() === "admin"),
    [filteredRows]
  );
  const otherRows = useMemo(
    () => filteredRows.filter((r: any) => String(r?.userRole || "").toLowerCase() !== "admin"),
    [filteredRows]
  );

  const enableListScroll = filteredRows.length > 12;

  const [infoRow, setInfoRow] = useState<AgentRow | null>(null);

  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [matriculeSol, setMatriculeSol] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [grade, setGrade] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [roleMetierId, setRoleMetierId] = useState<string>("");
  const [contactTelephone, setContactTelephone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [enablePasswordChange, setEnablePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [roleMetierUnlocked, setRoleMetierUnlocked] = useState(false);
  const [matriculeUnlocked, setMatriculeUnlocked] = useState(false);
  const [gradeUnlocked, setGradeUnlocked] = useState(false);
  const [genreUnlocked, setGenreUnlocked] = useState(false);
  const [prenomUnlocked, setPrenomUnlocked] = useState(false);
  const [nomUnlocked, setNomUnlocked] = useState(false);
  const [contactTelephoneUnlocked, setContactTelephoneUnlocked] = useState(false);
  const [contactEmailUnlocked, setContactEmailUnlocked] = useState(false);
  const [editRegion, setEditRegion] = useState("");
  const [editDepartement, setEditDepartement] = useState("");
  const [editCommune, setEditCommune] = useState("");
  const [editArrondissement, setEditArrondissement] = useState("");
  const [regionUnlocked, setRegionUnlocked] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [userMatricule, setUserMatricule] = useState("");
  const [addErrorOpen, setAddErrorOpen] = useState(false);
  const [addErrorTitle, setAddErrorTitle] = useState("Erreur");
  const [addErrorMessage, setAddErrorMessage] = useState("");
  const [newNom, setNewNom] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newRoleMetierId, setNewRoleMetierId] = useState("");
  const [newRoleMetierUnlocked, setNewRoleMetierUnlocked] = useState(false);
  const [newContactTelephone, setNewContactTelephone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newDepartement, setNewDepartement] = useState("");
  const [newCommune, setNewCommune] = useState("");
  const [newArrondissement, setNewArrondissement] = useState("");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessCount, setImportSuccessCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importUpdateExisting, setImportUpdateExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Normalize a string for comparison (remove accents, lowercase)
  const normalizeStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_\s]+/g, "");

  const addDepId = departementsList.find((f: any) =>
    normalizeStr(String(f.properties?.nom || "")) === normalizeStr(newDepartement) ||
    normalizeStr(String(f.properties?.code || "")) === normalizeStr(newDepartement)
  )?.properties?.id;
  const editDepId = departementsList.find((f: any) =>
    normalizeStr(String(f.properties?.nom || "")) === normalizeStr(editDepartement) ||
    normalizeStr(String(f.properties?.code || "")) === normalizeStr(editDepartement)
  )?.properties?.id;

  const { data: arrondissementsAddFeature } = useQuery({
    queryKey: ["/api/arrondissements", addDepId],
    queryFn: () => apiRequest<any>({ url: `/api/arrondissements${addDepId ? `?departementId=${addDepId}` : ""}`, method: "GET" }),
    enabled: !!addDepId,
  });
  const arrondissementsAddList = arrondissementsAddFeature?.features || [];

  const { data: communesAddFeature } = useQuery({
    queryKey: ["/api/communes", addDepId],
    queryFn: () => apiRequest<any>({ url: `/api/communes${addDepId ? `?departementId=${addDepId}` : ""}`, method: "GET" }),
    enabled: !!addDepId,
  });
  const communesAddList = communesAddFeature?.features || [];

  const { data: arrondissementsEditFeature } = useQuery({
    queryKey: ["/api/arrondissements", editDepId],
    queryFn: () => apiRequest<any>({ url: `/api/arrondissements${editDepId ? `?departementId=${editDepId}` : ""}`, method: "GET" }),
    enabled: !!editDepId,
  });
  const arrondissementsEditList = arrondissementsEditFeature?.features || [];

  const { data: communesEditFeature } = useQuery({
    queryKey: ["/api/communes", editDepId],
    queryFn: () => apiRequest<any>({ url: `/api/communes${editDepId ? `?departementId=${editDepId}` : ""}`, method: "GET" }),
    enabled: !!editDepId,
  });
  const communesEditList = communesEditFeature?.features || [];


  const handleAddOpenChange = (open: boolean) => {
    setAddOpen(open);
    if (!open) {
      setNewRoleMetierUnlocked(false);
    }
  };

  const showAddError = (title: string, message: string) => {
    setAddErrorTitle(title);
    setAddErrorMessage(message);
    setAddErrorOpen(true);
    toast({ title, description: message, variant: "destructive" });
  };

  const resolveApiErrorMessage = (e: any): string => {
    if (e?.body?.message) return String(e.body.message);
    if (e?.body?.errors && Array.isArray(e.body.errors)) {
      return e.body.errors.map((err: any) => `${err.path?.join(".") || "champ"}: ${err.message}`).join("\n");
    }
    if (e?.message) return String(e.message);
    if (e?.status === 401) return "Session expirée. Reconnectez-vous puis réessayez.";
    if (e?.status === 409) return "Conflit : matricule ou email déjà utilisé par un compte actif.";
    return "Ajout impossible. Vérifiez les champs ou réessayez.";
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const m = userMatricule.trim();
      if (!m) throw new Error("Matricule utilisateur requis");

      const mDigits = m.replace(/\s+/g, "");
      if (/^\d{9}$/.test(mDigits)) {
        throw new Error("Matricule invalide (ne doit pas être un numéro de téléphone)");
      }

      const email = newContactEmail.trim().toLowerCase();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk) {
        throw new Error("Email invalide");
      }

      const nNom = normalizeNom(newNom);
      const nPrenom = normalizePrenom(newPrenom);
      const nGrade = newGrade.trim() || null;

      const nameLetters = /^[\p{L} ]+$/u;
      if (nNom && !nameLetters.test(nNom)) {
        throw new Error("Nom invalide (lettres uniquement)");
      }
      if (nPrenom && !nameLetters.test(nPrenom)) {
        throw new Error("Prénom invalide (lettres uniquement)");
      }

      return apiRequest<any>({
        url: "/api/agents",
        method: "POST",
        data: {
          userMatricule: m,
          email,
          phone: newContactTelephone.trim() || null,
          firstName: nPrenom || null,
          lastName: nNom || null,
          nom: nNom || null,
          prenom: nPrenom || null,
          grade: nGrade,
          genre: newGenre && newGenre !== "none" ? newGenre : null,
          roleMetierId: newRoleMetierId && newRoleMetierId !== "none" ? Number(newRoleMetierId) : null,
          region: newRegion || null,
          departement: newDepartement || null,
          commune: newCommune || null,
          arrondissement: newArrondissement || null,
          contact: {
            telephone: newContactTelephone.trim() || null,
            email: email || null,
          },
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent ajouté" });
      setAddOpen(false);
      setUserMatricule("");
      setNewNom("");
      setNewPrenom("");
      setNewGrade("");
      setNewGenre("");
      setNewRoleMetierId("");
      setNewRoleMetierUnlocked(false);
      setNewContactTelephone("");
      setNewContactEmail("");
      setNewRegion("");
      setNewDepartement("");
      setNewCommune("");
      setNewArrondissement("");
    },
    onError: (e: any) => {
      const msg = resolveApiErrorMessage(e);
      const title =
        e?.status === 401
          ? "Session expirée"
          : e?.status === 409
            ? "Doublon détecté"
            : e?.status === 400
              ? "Données invalides"
              : "Erreur";
      showAddError(title, msg);
    },
  });

  const handleCreateAgent = () => {
    if (document.body.hasAttribute("data-session-locked")) {
      showAddError(
        "Session expirée ou verrouillée",
        "Reconnectez-vous ou déverrouillez l'écran avant d'ajouter un agent."
      );
      return;
    }
    if (!userMatricule.trim()) {
      showAddError("Champ requis", "Le matricule utilisateur est obligatoire.");
      return;
    }
    if (!newContactEmail.trim()) {
      showAddError("Champ requis", "L'email de contact est obligatoire.");
      return;
    }
    createMutation.mutate();
  };

  const openEdit = (row: AgentRow) => {
    setEditing(row);
    setEditUnlocked(false);
    setRoleMetierUnlocked(false);
    setMatriculeUnlocked(false);
    setGradeUnlocked(false);
    setGenreUnlocked(false);
    setPrenomUnlocked(false);
    setNomUnlocked(false);
    setContactTelephoneUnlocked(false);
    setContactEmailUnlocked(false);
    setMatriculeSol(row.matriculeSol || "");
    setNom(row.nom || "");
    setPrenom(row.prenom || "");
    setGrade(row.grade || "");
    setGenre(row.genre ? String(row.genre) : "");
    setRoleMetierId(row.roleMetierId ? String(row.roleMetierId) : "");

    setEnablePasswordChange(false);
    setNewPassword("");
    setShowPassword(false);

    const c = row.contact || {};
    setContactTelephone(String(c?.telephone || c?.phone || row.phone || ""));
    setContactEmail(String(c?.email || row.email || ""));
    setEditRegion(row.region || "");
    setEditDepartement(row.departement || "");
    setEditCommune(row.commune || "");
    setEditArrondissement(row.arrondissement || "");
    setRegionUnlocked(false);
  };

  const clearEditFields = () => {
    // Conserver rôle métier (roleMetierId) comme demandé
    setEditUnlocked(true);
    setMatriculeUnlocked(false);
    setGradeUnlocked(false);
    setGenreUnlocked(false);
    setPrenomUnlocked(false);
    setNomUnlocked(false);
    setContactTelephoneUnlocked(false);
    setContactEmailUnlocked(false);
    setMatriculeSol("");
    setGrade("");
    setGenre("");
    setPrenom("");
    setNom("");
    setContactTelephone("");
    setContactEmail("");
    setEditRegion("");
    setEditDepartement("");
    setEditCommune("");
    setEditArrondissement("");
    setRegionUnlocked(false);
    // Ne pas impacter la section mot de passe (gérée indépendamment)
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: { idAgent: number; data: any }) => {
      const byUserId = payload?.data?.__byUserId;
      if (byUserId) {
        const data = { ...(payload.data || {}) };
        delete data.__byUserId;
        return apiRequest<AgentRow>({
          url: `/api/agents/by-user/${Number(byUserId)}`,
          method: "PUT",
          data,
        });
      }

      return apiRequest<AgentRow>({
        url: `/api/agents/${payload.idAgent}`,
        method: "PUT",
        data: payload.data,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent mis à jour" });
      setEditing(null);
    },
    onError: (e: any) => {
      let msg = String(e?.message || "Mise à jour impossible");
      if (e?.body?.errors && Array.isArray(e.body.errors)) {
        msg = e.body.errors.map((err: any) => `${err.path?.join('.')}: ${err.message}`).join(', ');
      }
      toast({
        title: "Erreur",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const save = () => {
    if (!editing) return;

    if (enablePasswordChange) {
      const pwd = newPassword.trim();
      if (pwd && pwd.length < 6) {
        toast({
          title: "Erreur",
          description: "Le mot de passe doit contenir au moins 6 caractères.",
          variant: "destructive",
        });
        return;
      }
    }

    const contact = {
      telephone: contactTelephone || null,
      email: contactEmail || null,
    };

    const data: any = {
      __byUserId: editing.userId,
      matriculeSol: matriculeSol.trim() || null,
      nom: normalizeNom(nom) || null,
      prenom: normalizePrenom(prenom) || null,
      grade: grade.trim() || null,
      genre: genre && genre !== "none" ? genre : null,
      roleMetierId: roleMetierId && roleMetierId !== "none" ? Number(roleMetierId) : null,
      contact: Object.keys(contact).length ? contact : null,
      region: editRegion || null,
      departement: editDepartement || null,
      commune: editCommune || null,
      arrondissement: editArrondissement || null,
    };

    if (enablePasswordChange && newPassword.trim()) {
      data.password = newPassword.trim();
    }

    updateMutation.mutate({ idAgent: editing.idAgent || 0, data });
  };

  const handleDownloadTemplate = () => {
    const template = [
      ["Matricule", "Prenom", "Nom", "Numero Telephone", "Email", "Region", "Departement", "Arrondissement", "Commune", "Genre", "Grade"],
      ["A001", "Moussa", "Diop", "771234567", "m.diop@scodi.com", "THIES", "Dakar", "Dakar Plateau", "Plateau", "M", "Capitaine"]
    ];
    const csv = Papa.unparse(template, { delimiter: ";" });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "modele_import_agents.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    if (!filteredRows || filteredRows.length === 0) {
      toast({ title: "Aucune donnée à exporter", variant: "destructive" });
      return;
    }
    const data = filteredRows.map(r => ({
      Matricule: r.matriculeSol || "",
      Prenom: r.prenom || "",
      Nom: r.nom || "",
      Grade: r.grade || "",
      Genre: r.genre || "",
      "Rôle Métier": r.roleMetierLabel || "",
      Telephone: (r.contact && (r.contact.telephone || r.contact.phone)) || "",
      Email: r.email || (r.contact && r.contact.email) || "",
      Region: r.region || "",
      Departement: r.departement || "",
      Commune: r.commune || "",
      Arrondissement: r.arrondissement || ""
    }));
    const csv = Papa.unparse(data, { delimiter: ";" });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "export_agents_scodi.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "windows-1252",
      complete: async (results) => {
        const rows = results.data as any[];
        if (rows.length === 0) {
          toast({ title: "Le fichier est vide", variant: "destructive" });
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        setIsImporting(true);
        setImportDialogOpen(true);
        setImportProgress({ current: 0, total: rows.length });
        setImportErrors([]);
        setImportSuccessCount(0);

        let successCount = 0;
        const errors: string[] = [];
        const matriculesInFile = new Set<string>();
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_\-]/g, "");
            normalizedRow[normalizedKey] = row[key];
          });

          const matricule = (normalizedRow.matricule || "").trim();
          let prenom = (normalizedRow.prenom || "").trim();
          let nom = (normalizedRow.nom || "").trim();
          const telephone = (normalizedRow.numerotelephone || normalizedRow.telephone || "").trim();
          let email = (normalizedRow.email || "").trim();
          const grade = (normalizedRow.grade || "").trim();
          const genre = (normalizedRow.genre || "").trim();
          const region = (normalizedRow.region || normalizedRow.niveau || "").trim();
          const departement = (normalizedRow.departement || "").trim();
          const arrondissement = (normalizedRow.arrondissement || "").trim();
          const commune = (normalizedRow.commune || "").trim();

          if (!matricule || !prenom || !nom) {
            errors.push(`Ligne ${i + 2}: Matricule, Prénom ou Nom manquant.`);
            setImportProgress({ current: i + 1, total: rows.length });
            continue;
          }

          if (matriculesInFile.has(matricule)) {
            errors.push(`Ligne ${i + 2}: Matricule en double dans le fichier (${matricule}).`);
            setImportProgress({ current: i + 1, total: rows.length });
            continue;
          }
          matriculesInFile.add(matricule);

          if (!email) {
            const safeMatricule = matricule.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            const safePrenom = prenom.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            const safeNom = nom.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            email = `${safeMatricule}.${safePrenom}.${safeNom}@scodi.com`;
          }

          const existingAgent = rows.find((r: any) => r.matriculeSol?.toLowerCase() === matricule.toLowerCase());

          if (existingAgent && !importUpdateExisting) {
            errors.push(`Ligne ${i + 2}: Matricule existant en base (${matricule}). Activez "Mettre à jour" pour l'écraser.`);
            setImportProgress({ current: i + 1, total: rows.length });
            continue;
          }

          try {
            const agentData = {
              userMatricule: matricule,
              email,
              phone: telephone || null,
              firstName: prenom,
              lastName: nom,
              nom,
              prenom,
              grade: grade || null,
              genre: genre || null,
              region: region || null,
              departement: departement || null,
              commune: commune || null,
              arrondissement: arrondissement || null,
              contact: {
                telephone: telephone || null,
                email
              },
            };

            if (existingAgent && importUpdateExisting) {
              if (existingAgent.idAgent) {
                await apiRequest<any>({
                  url: `/api/agents/${existingAgent.idAgent}`,
                  method: "PUT",
                  data: agentData,
                });
              } else {
                await apiRequest<any>({
                  url: `/api/agents/by-user/${existingAgent.userId}`,
                  method: "PUT",
                  data: agentData,
                });
              }
            } else {
              await apiRequest<any>({
                url: "/api/agents",
                method: "POST",
                data: agentData,
              });
            }
            successCount++;
          } catch (err: any) {
            const msg = err?.body?.message || err?.message || "Erreur inconnue";
            errors.push(`Ligne ${i + 2} (${matricule}): ${msg}`);
          }
          setImportProgress({ current: i + 1, total: rows.length });
          setImportSuccessCount(successCount);
        }

        setIsImporting(false);
        setImportErrors(errors);
        qc.invalidateQueries({ queryKey: ["/api/agents"] });
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error) => {
        toast({ title: "Erreur de lecture du fichier CSV", description: error.message, variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    for (const id of Array.from(selectedRows)) {
      try {
        await apiRequest({ url: `/api/agents/${id}`, method: "DELETE" });
      } catch (e) {
        console.error("Failed to delete agent", id, e);
      }
    }
    setSelectedRows(new Set());
    qc.invalidateQueries({ queryKey: ["/api/agents"] });
    toast({ title: "Agents supprimés" });
  };

  return (
    <div className="space-y-4 w-full px-4 py-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Contrôle des Agents</h2>
          <div className="text-sm text-muted-foreground">Administration centrale - Gestion des comptes (agents)</div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Liste des agents ({filteredRows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col xl:flex-row gap-3 xl:items-start justify-between mb-4">
              <div className="w-full flex flex-wrap gap-2 items-center">
                <Input
                  placeholder="Rechercher par matricule"
                  value={searchMatricule}
                  onChange={(e) => setSearchMatricule(e.target.value)}
                  className="w-full md:max-w-[180px]"
                />
                <Select value={filterRegion} onValueChange={setFilterRegion}>
                  <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Région" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les régions</SelectItem>
                    {uniqueRegions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterDepartement} onValueChange={setFilterDepartement}>
                  <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Département" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les dépt.</SelectItem>
                    {uniqueDepartements.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterCommune} onValueChange={setFilterCommune}>
                  <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Commune" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les comm.</SelectItem>
                    {uniqueCommunes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterArrondissement} onValueChange={setFilterArrondissement}>
                  <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Arrondissement" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les arrond.</SelectItem>
                    {uniqueArrondissements.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end w-full xl:w-auto mt-2 xl:mt-0">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant={selectedRows.size > 0 ? "destructive" : "outline"} disabled={selectedRows.size === 0}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer{selectedRows.size > 0 ? ` (${selectedRows.size})` : ""}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                      <AlertDialogDescription>
                        Voulez-vous vraiment supprimer les {selectedRows.size} agents sélectionnés ?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete}>
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  Modèle CSV
                </Button>
                <Button variant="outline" onClick={handleExportCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Exporter
                </Button>
                <div className="relative">
                  <input
                    type="file"
                    accept=".csv"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleImportCSV}
                    ref={fileInputRef}
                  />
                  <Button variant="outline" type="button">
                    <Upload className="mr-2 h-4 w-4" />
                    Importer
                  </Button>
                </div>
                <Button onClick={() => setAddOpen(true)}>
                  Ajouter un Agent
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-6">Chargement...</div>
            ) : (
              <div className="border rounded-md">
                <Table wrapperClassName="max-h-[600px] overflow-y-auto w-full">
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={filteredRows.length > 0 && selectedRows.size === filteredRows.filter(r => r.idAgent).length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const allIds = new Set(filteredRows.filter(r => r.idAgent).map(r => r.idAgent as number));
                              setSelectedRows(allIds);
                            } else {
                              setSelectedRows(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead></TableHead>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      <TableHead>Rôle métier</TableHead>
                      <TableHead className="text-center">Genre</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Région</TableHead>
                      <TableHead>Département</TableHead>
                      <TableHead>Commune</TableHead>
                      <TableHead>Arrondissement</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredRows.map((r: any) => (
                      <TableRow key={r.idAgent ?? `u-${r.userId}`}>
                        <TableCell>
                          {r.idAgent ? (
                            <Checkbox
                              checked={selectedRows.has(r.idAgent)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedRows);
                                if (checked) next.add(r.idAgent);
                                else next.delete(r.idAgent);
                                setSelectedRows(next);
                              }}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <User className={`h-4 w-4 ${r.userRole?.toLowerCase() === 'admin' ? 'text-blue-600' : 'text-green-600'}`} />
                        </TableCell>
                        <TableCell>{r.matriculeSol}</TableCell>
                        <TableCell>{r.prenom || "-"}</TableCell>
                        <TableCell>{r.nom || "-"}</TableCell>
                        <TableCell className="text-center">{r.grade || "-"}</TableCell>
                        <TableCell>{r.roleMetierLabel || (r.roleMetierId ? String(r.roleMetierId) : "-")}</TableCell>
                        <TableCell className="text-center">{r.genre || "-"}</TableCell>
                        <TableCell>{r.phone || (r.contact && (r.contact.telephone || r.contact.phone)) || "-"}</TableCell>
                        <TableCell>{r.region || "-"}</TableCell>
                        <TableCell>{r.departement || "-"}</TableCell>
                        <TableCell>{r.commune || "-"}</TableCell>
                        <TableCell>{r.arrondissement || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                              Modifier
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-sky-500 hover:text-sky-600"
                              onClick={() => setInfoRow(r)}
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!infoRow} onOpenChange={(open) => !open && setInfoRow(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Information</DialogTitle>
            </DialogHeader>
            <div className="text-sm">
              Cet utilisateur est l'administrateur du domaine "{infoRow?.adminDomainName || "-"}".
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInfoRow(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center justify-center gap-4">
                <DialogTitle>Modifier un agent</DialogTitle>
                <Button type="button" variant="outline" onClick={clearEditFields}>
                  Effacer
                </Button>
              </div>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule</Label>
                <div className="relative">
                  <Input
                    value={matriculeSol}
                    onChange={(e) => setMatriculeSol(e.target.value)}
                    disabled={!editUnlocked && !matriculeUnlocked}
                    className={!editUnlocked && !matriculeUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setMatriculeUnlocked(true)}
                    disabled={editUnlocked || matriculeUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <div className="relative">
                  <GradeSelectField
                    value={grade}
                    onChange={setGrade}
                    disabled={!editUnlocked && !gradeUnlocked}
                    options={gradeOptions}
                    triggerClassName={!editUnlocked && !gradeUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-10"
                    onClick={() => setGradeUnlocked(true)}
                    disabled={editUnlocked || gradeUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select
                  value={genre ? genre : "none"}
                  onValueChange={(v) => setGenre(v === "none" ? "" : v)}
                  disabled={!editUnlocked && !genreUnlocked}
                >
                  <div className="relative">
                    <SelectTrigger className={!editUnlocked && !genreUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}>
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setGenreUnlocked(true)}
                      disabled={editUnlocked || genreUnlocked}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="H">H</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prénom</Label>
                <div className="relative">
                  <Input
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                    onBlur={() => setPrenom((v) => normalizePrenom(v))}
                    disabled={!editUnlocked && !prenomUnlocked}
                    className={!editUnlocked && !prenomUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setPrenomUnlocked(true)}
                    disabled={editUnlocked || prenomUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <div className="relative">
                  <Input
                    value={nom}
                    onChange={(e) => setNom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                    onBlur={() => setNom((v) => normalizeNom(v))}
                    disabled={!editUnlocked && !nomUnlocked}
                    className={!editUnlocked && !nomUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setNomUnlocked(true)}
                    disabled={editUnlocked || nomUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rôle métier</Label>
                <Select
                  value={roleMetierId ? roleMetierId : "none"}
                  onValueChange={(v) => setRoleMetierId(v === "none" ? "" : v)}
                  disabled={!roleMetierUnlocked}
                >
                  <div className="relative">
                    <SelectTrigger
                      className={!roleMetierUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                    >
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setRoleMetierUnlocked(true)}
                      disabled={roleMetierUnlocked}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {rolesMetier.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.labelFr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Téléphone (contact)</Label>
                <div className="relative">
                  <Input
                    value={contactTelephone}
                    placeholder="XX XXX XX XX"
                    onChange={(e) => setContactTelephone(formatPhoneNumber(e.target.value))}
                    disabled={!editUnlocked && !contactTelephoneUnlocked}
                    className={!editUnlocked && !contactTelephoneUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setContactTelephoneUnlocked(true)}
                    disabled={editUnlocked || contactTelephoneUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email (contact)</Label>
                <div className="relative">
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    disabled={!editUnlocked && !contactEmailUnlocked}
                    className={!editUnlocked && !contactEmailUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setContactEmailUnlocked(true)}
                    disabled={editUnlocked || contactEmailUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Région / Niveau</Label>
                <div className="relative">
                  <Select
                    value={editRegion || "none"}
                    onValueChange={(v) => { setEditRegion(v === "none" ? "" : v); setEditDepartement(""); setRegionUnlocked(true); }}
                    disabled={!editUnlocked && !regionUnlocked}
                  >
                    <div className="relative">
                      <SelectTrigger className={!editUnlocked && !regionUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}>
                        <SelectValue placeholder="Sélectionner une région" />
                      </SelectTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setRegionUnlocked(true)}
                        disabled={editUnlocked || regionUnlocked}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      <SelectItem value="national">NATIONAL</SelectItem>
                      {regionEnum.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editRegion && (departmentsByRegion as any)[editRegion] && (
                <div className="space-y-2">
                  <Label>Département / Secteur</Label>
                  <Select
                    value={editDepartement || "none"}
                    onValueChange={(v) => { setEditDepartement(v === "none" ? "" : v); setEditArrondissement(""); setEditCommune(""); }}
                    disabled={!editUnlocked && !regionUnlocked}
                  >
                    <SelectTrigger className={!editUnlocked && !regionUnlocked ? "bg-muted text-muted-foreground" : ""}>
                      <SelectValue placeholder="Sélectionner un département" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {(departmentsByRegion as any)[editRegion].map((d: any) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editDepartement && (
                <>
                  <div className="space-y-2">
                    <Label>Arrondissement</Label>
                    <Select
                      value={editArrondissement || "none"}
                      onValueChange={(v) => setEditArrondissement(v === "none" ? "" : v)}
                      disabled={!editUnlocked && !regionUnlocked}
                    >
                      <SelectTrigger className={!editUnlocked && !regionUnlocked ? "bg-muted text-muted-foreground" : ""}>
                        <SelectValue placeholder="Sélectionner un arrondissement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun</SelectItem>
                        {arrondissementsEditList.map((a: any) => (
                          <SelectItem key={a.properties.id} value={a.properties.nom}>{a.properties.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Commune</Label>
                    <Select
                      value={editCommune || "none"}
                      onValueChange={(v) => setEditCommune(v === "none" ? "" : v)}
                      disabled={!editUnlocked && !regionUnlocked}
                    >
                      <SelectTrigger className={!editUnlocked && !regionUnlocked ? "bg-muted text-muted-foreground" : ""}>
                        <SelectValue placeholder="Sélectionner une commune" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucune</SelectItem>
                        {communesEditList.map((c: any) => (
                          <SelectItem key={c.properties.id} value={c.properties.nom}>{c.properties.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="md:col-span-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4" />
                  <Label>Modifier le mot de passe</Label>
                </div>
                <Switch
                  checked={enablePasswordChange}
                  onCheckedChange={(checked) => {
                    setEnablePasswordChange(checked);
                    if (checked) setNewPassword("");
                  }}
                />
              </div>
              {enablePasswordChange && (
                <div className="space-y-2">
                  <Label>Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      name="agent_new_password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {newPassword.trim().length < 6 && (
                    <div className="text-xs text-destructive">
                      Saisir au moins 6 caractères
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button
                onClick={save}
                disabled={
                  updateMutation.isPending ||
                  (!editUnlocked &&
                    !matriculeUnlocked &&
                    !gradeUnlocked &&
                    !genreUnlocked &&
                    !prenomUnlocked &&
                    !nomUnlocked &&
                    !contactTelephoneUnlocked &&
                    !contactEmailUnlocked &&
                    !(enablePasswordChange && newPassword.trim().length >= 6) &&
                    !roleMetierUnlocked &&
                    !regionUnlocked) ||
                  (enablePasswordChange && newPassword.trim().length < 6)
                }
              >
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={addErrorOpen} onOpenChange={setAddErrorOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{addErrorTitle}</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line">
                {addErrorMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setAddErrorOpen(false)}>Compris</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Ajouter un agent</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule utilisateur (nouveau) *</Label>
                <Input placeholder="Ex: 740 364/B" value={userMatricule} onChange={(e) => setUserMatricule(e.target.value)} />
                {!userMatricule.trim() && <p className="text-xs text-destructive">Ce champ est requis</p>}
              </div>
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input
                  value={newPrenom}
                  onChange={(e) => setNewPrenom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                  onBlur={() => setNewPrenom((v) => normalizePrenom(v))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                  onBlur={() => setNewNom((v) => normalizeNom(v))}
                />
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <GradeSelectField value={newGrade} onChange={setNewGrade} options={gradeOptions} />
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={newGenre ? newGenre : "none"} onValueChange={(v) => setNewGenre(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="H">H</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rôle métier</Label>
                <Select
                  value={newRoleMetierId ? newRoleMetierId : "none"}
                  onValueChange={(v) => setNewRoleMetierId(v === "none" ? "" : v)}
                  disabled={!newRoleMetierUnlocked}
                >
                  <div className="relative">
                    <SelectTrigger className={!newRoleMetierUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}>
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setNewRoleMetierUnlocked(true)}
                      disabled={newRoleMetierUnlocked}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {rolesMetier.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.labelFr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Téléphone (contact)</Label>
                <Input
                  placeholder="XX XXX XX XX"
                  value={newContactTelephone}
                  onChange={(e) => setNewContactTelephone(formatPhoneNumber(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email (contact) *</Label>
                <Input type="email" placeholder="exemple@email.com" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
                {!newContactEmail.trim() && <p className="text-xs text-destructive">Ce champ est requis</p>}
              </div>
              <div className="space-y-2">
                <Label>Niveau</Label>
                <Select value={newRegion || "none"} onValueChange={(v) => { setNewRegion(v === "none" ? "" : v); setNewDepartement(""); setNewArrondissement(""); setNewCommune(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    <SelectItem value="national">NATIONAL</SelectItem>
                    {regionEnum.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newRegion && (departmentsByRegion as any)[newRegion] && (
                <div className="space-y-2">
                  <Label>Département</Label>
                  <Select value={newDepartement || "none"} onValueChange={(v) => { setNewDepartement(v === "none" ? "" : v); setNewArrondissement(""); setNewCommune(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un département" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {(departmentsByRegion as any)[newRegion].map((d: any) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {newDepartement && (
                <>
                  <div className="space-y-2">
                    <Label>Arrondissement</Label>
                    <Select value={newArrondissement || "none"} onValueChange={(v) => setNewArrondissement(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un arrondissement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun</SelectItem>
                        {arrondissementsAddList.map((a: any) => (
                          <SelectItem key={a.properties.id} value={a.properties.nom}>{a.properties.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Commune</Label>
                    <Select value={newCommune || "none"} onValueChange={(v) => setNewCommune(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une commune" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucune</SelectItem>
                        {communesAddList.map((c: any) => (
                          <SelectItem key={c.properties.id} value={c.properties.nom}>{c.properties.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleAddOpenChange(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleCreateAgent}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Création…" : "Ajouter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importDialogOpen} onOpenChange={(open) => !isImporting && setImportDialogOpen(open)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Importation des agents</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-2 border p-3 rounded-md mb-2">
                <Switch 
                  id="import-update" 
                  checked={importUpdateExisting} 
                  onCheckedChange={setImportUpdateExisting} 
                  disabled={isImporting}
                />
                <Label htmlFor="import-update">
                  Mettre à jour les agents existants (remplace les doublons)
                </Label>
              </div>

              <div className="text-sm">
                Progression : {importProgress.current} / {importProgress.total}
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-300" 
                  style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }} 
                />
              </div>
              
              {!isImporting && (
                <div className="mt-4">
                  <div className="font-semibold text-green-600 mb-2">
                    Succès : {importSuccessCount} agent(s) importé(s).
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    Les nouveaux agents ont été créés avec le mot de passe par défaut (0000).
                  </div>
                  {importErrors.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold text-red-600">Erreurs ({importErrors.length}) :</div>
                      <div className="max-h-40 overflow-y-auto text-sm bg-muted p-2 rounded-md">
                        {importErrors.map((err, idx) => (
                          <div key={idx} className="text-red-500 mb-1">{err}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setImportDialogOpen(false)} disabled={isImporting}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

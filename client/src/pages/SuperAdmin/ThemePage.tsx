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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Domaine = {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  createdAt: string;
};

type SuperAdminTheme = {
  useLegacyDark: boolean;
  bg?: string;
  text?: string;
  sidebarBg?: string;
  headerBg?: string;
  surface?: string;
  border?: string;
  accent?: string;
};

type DomainTheme = {
  from?: string;
  to?: string;
  icon?: string;
  logoUrl?: string;
};

type ThemeConfig = {
  superAdmin: SuperAdminTheme;
  domains: Record<string, DomainTheme>;
};

const DEFAULT_CFG: ThemeConfig = {
  superAdmin: {
    useLegacyDark: true,
    bg: "#0b1326",
    text: "#dae2fd",
    sidebarBg: "#0d1220",
    headerBg: "#131b2e",
    surface: "#171f33",
    border: "#3d4947",
    accent: "#6bd8cb",
  },
  domains: {},
};

const SUPERADMIN_PALETTES: Array<{ name: string; values: Omit<SuperAdminTheme, 'useLegacyDark'> }> = [
  {
    name: 'Professionnel Navy/Teal',
    values: {
      bg: '#0b1326',
      text: '#dae2fd',
      sidebarBg: '#0d1220',
      headerBg: '#131b2e',
      surface: '#171f33',
      border: '#3d4947',
      accent: '#6bd8cb',
    },
  },
  {
    name: 'Sombre Bleu',
    values: {
      bg: '#070a12',
      text: '#93c5fd',
      sidebarBg: '#0b1220',
      headerBg: '#0b1220',
      surface: '#0f172a',
      border: '#1e293b',
      accent: '#3b82f6',
    },
  },
  {
    name: 'Sombre Or',
    values: {
      bg: '#0b0b0b',
      text: '#fde68a',
      sidebarBg: '#101010',
      headerBg: '#141414',
      surface: '#171717',
      border: '#2a2a2a',
      accent: '#f59e0b',
    },
  },
  {
    name: 'Clair',
    values: {
      bg: '#eef2f7',
      text: '#0f172a',
      sidebarBg: '#ffffff',
      headerBg: '#ffffff',
      surface: '#ffffff',
      border: '#cbd5e1',
      accent: '#2563eb',
    },
  },
  {
    name: 'Sombre Vert (legacy)',
    values: {
      bg: '#0a0a0a',
      text: '#22c55e',
      sidebarBg: '#111111',
      headerBg: '#0d1b0d',
      surface: '#1a1a1a',
      border: '#1a3a1a',
      accent: '#22c55e',
    },
  },
];

const DOMAIN_ICON_CHOICES = [
  'Target',
  'Trees',
  'Sprout',
  'AlertTriangle',
  'Shield',
  'Leaf',
  'MapPin',
  'Bell',
  'MessageSquare',
  'Users',
  'FileText',
  'Settings',
] as const;

function safeParse(raw: string | null): ThemeConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeCfg(cfg: ThemeConfig): ThemeConfig {
  return {
    ...cfg,
    superAdmin: {
      ...cfg.superAdmin,
      useLegacyDark: false,
    },
  };
}

export default function ThemePage() {
  const { data: domaines } = useQuery({
    queryKey: ["/api/domaines"],
    queryFn: () => apiRequest<Domaine[]>({ url: "/api/domaines", method: "GET" }),
    retry: false,
  });

  const domainesList = useMemo(() => (Array.isArray(domaines) ? domaines : []), [domaines]);

  const [appliedCfg, setAppliedCfg] = useState<ThemeConfig>(() => normalizeCfg(safeParse(localStorage.getItem("theme:superadmin")) || DEFAULT_CFG));
  const [draftCfg, setDraftCfg] = useState<ThemeConfig>(() => normalizeCfg(safeParse(localStorage.getItem("theme:superadmin")) || DEFAULT_CFG));

  const applyPreviewToDom = (cfg: SuperAdminTheme) => {
    const html = document.documentElement;

    html.classList.add("superadmin-theme");
    // Variables --sa-* utilisées par superAdminTheme.css & darkSuperAdmin.css
    if (cfg.bg) html.style.setProperty("--sa-bg", cfg.bg);
    if (cfg.text) html.style.setProperty("--sa-text", cfg.text);
    if (cfg.sidebarBg) html.style.setProperty("--sa-sidebar-bg", cfg.sidebarBg);
    if (cfg.headerBg) html.style.setProperty("--sa-header-bg", cfg.headerBg);
    if (cfg.surface) html.style.setProperty("--sa-surface", cfg.surface);
    if (cfg.border) html.style.setProperty("--sa-border", cfg.border);
    if (cfg.accent) html.style.setProperty("--sa-primary", cfg.accent);
    if (cfg.text) html.style.setProperty("--sa-text-secondary", cfg.text);
    // Compat legacy
    if (cfg.bg) html.style.setProperty("--superadmin-bg", cfg.bg);
    if (cfg.text) html.style.setProperty("--superadmin-text", cfg.text);
    if (cfg.sidebarBg) html.style.setProperty("--superadmin-sidebar-bg", cfg.sidebarBg);
    if (cfg.headerBg) html.style.setProperty("--superadmin-header-bg", cfg.headerBg);
    if (cfg.surface) html.style.setProperty("--superadmin-surface", cfg.surface);
    if (cfg.border) html.style.setProperty("--superadmin-border", cfg.border);
    if (cfg.accent) html.style.setProperty("--superadmin-accent", cfg.accent);
  };

  const hasChanges = useMemo(() => {
    try {
      return JSON.stringify(draftCfg) !== JSON.stringify(appliedCfg);
    } catch {
      return true;
    }
  }, [draftCfg, appliedCfg]);

  useEffect(() => {
    applyPreviewToDom(draftCfg.superAdmin);
  }, [draftCfg.superAdmin.bg, draftCfg.superAdmin.text, draftCfg.superAdmin.sidebarBg, draftCfg.superAdmin.headerBg, draftCfg.superAdmin.surface, draftCfg.superAdmin.border, draftCfg.superAdmin.accent]);

  useEffect(() => {
    return () => {
      applyPreviewToDom(appliedCfg.superAdmin);
    };
  }, [appliedCfg.superAdmin.bg, appliedCfg.superAdmin.text, appliedCfg.superAdmin.sidebarBg, appliedCfg.superAdmin.headerBg, appliedCfg.superAdmin.surface, appliedCfg.superAdmin.border, appliedCfg.superAdmin.accent]);

  const applyChanges = () => {
    const next = normalizeCfg(draftCfg);
    try {
      localStorage.setItem("theme:superadmin", JSON.stringify(next));
    } catch {}
    setDraftCfg(next);
    setAppliedCfg(next);
    try {
      window.dispatchEvent(new Event('theme:superadmin:updated'));
    } catch {}
  };

  const [editingField, setEditingField] = useState<string | null>(null);

  const ColorField = ({
    id,
    value,
    placeholder,
    onChange,
  }: {
    id: string;
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
  }) => {
    const isEditing = editingField === id;

    if (isEditing) {
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditingField(null)}
          placeholder={placeholder}
          autoFocus
        />
      );
    }

    return (
      <button
        type="button"
        className="h-10 w-full rounded-md border bg-muted px-3 py-2 text-left text-sm text-muted-foreground flex items-center justify-between"
        onClick={() => setEditingField(id)}
      >
        <span className="font-mono">{value || placeholder || "-"}</span>
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  };

  const [selectedDomain, setSelectedDomain] = useState<string>("");

  useEffect(() => {
    if (!selectedDomain && domainesList.length > 0) {
      setSelectedDomain(domainesList[0].nomDomaine);
    }
  }, [domainesList, selectedDomain]);

  const domainKey = String(selectedDomain || "").toUpperCase();
  const domainTheme: DomainTheme = draftCfg.domains[domainKey] || {};

  const updateSuperAdmin = (patch: Partial<SuperAdminTheme>) => {
    setDraftCfg((prev) => ({
      ...prev,
      superAdmin: { ...prev.superAdmin, ...patch },
    }));
  };

  const updateDomain = (patch: Partial<DomainTheme>) => {
    setDraftCfg((prev) => ({
      ...prev,
      domains: {
        ...prev.domains,
        [domainKey]: { ...(prev.domains[domainKey] || {}), ...patch },
      },
    }));
  };

  const resetDraft = () => {
    setDraftCfg(normalizeCfg(DEFAULT_CFG));
  };

  const applyPalette = (p: (typeof SUPERADMIN_PALETTES)[number]) => {
    setDraftCfg((prev) => ({
      ...prev,
      superAdmin: {
        ...prev.superAdmin,
        ...p.values,
      },
    }));
  };

  const activePaletteName = useMemo(() => {
    const cur = draftCfg.superAdmin;
    const match = SUPERADMIN_PALETTES.find((p) => {
      return (
        (cur.bg || "") === (p.values.bg || "") &&
        (cur.text || "") === (p.values.text || "") &&
        (cur.sidebarBg || "") === (p.values.sidebarBg || "") &&
        (cur.headerBg || "") === (p.values.headerBg || "") &&
        (cur.surface || "") === (p.values.surface || "") &&
        (cur.border || "") === (p.values.border || "") &&
        (cur.accent || "") === (p.values.accent || "")
      );
    });
    return match?.name || "";
  }, [draftCfg.superAdmin.bg, draftCfg.superAdmin.text, draftCfg.superAdmin.sidebarBg, draftCfg.superAdmin.headerBg, draftCfg.superAdmin.surface, draftCfg.superAdmin.border, draftCfg.superAdmin.accent]);

  const appliedPaletteName = useMemo(() => {
    const cur = appliedCfg.superAdmin;
    const match = SUPERADMIN_PALETTES.find((p) => {
      return (
        (cur.bg || "") === (p.values.bg || "") &&
        (cur.text || "") === (p.values.text || "") &&
        (cur.sidebarBg || "") === (p.values.sidebarBg || "") &&
        (cur.headerBg || "") === (p.values.headerBg || "") &&
        (cur.surface || "") === (p.values.surface || "") &&
        (cur.border || "") === (p.values.border || "") &&
        (cur.accent || "") === (p.values.accent || "")
      );
    });
    return match?.name || "";
  }, [appliedCfg.superAdmin.bg, appliedCfg.superAdmin.text, appliedCfg.superAdmin.sidebarBg, appliedCfg.superAdmin.headerBg, appliedCfg.superAdmin.surface, appliedCfg.superAdmin.border, appliedCfg.superAdmin.accent]);

  const onUploadDomainLogo = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read-failed'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      updateDomain({ logoUrl: dataUrl });
    } catch {}
  };

  return (
    <main className="page-frame-container">
      <div className="page-frame-inner container mx-auto px-4 py-4 space-y-4 max-w-6xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Thème</h2>
          <div className="text-sm text-muted-foreground">Personnaliser les couleurs et l'apparence</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                Réinitialiser
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer la réinitialisation</AlertDialogTitle>
                <AlertDialogDescription>
                  Voulez-vous réinitialiser le thème ? Vous devrez cliquer sur "Appliquer" pour prendre effet.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={resetDraft}>Réinitialiser</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={applyChanges} disabled={!hasChanges} className="bg-teal-600 hover:bg-teal-700">
            Appliquer
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>SuperAdmin</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 grid gap-2">
              <Label>Palettes proposées</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex flex-wrap rounded-md border overflow-hidden">
                  {SUPERADMIN_PALETTES.map((p, idx) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPalette(p)}
                      className={`h-9 px-3 text-sm ${idx !== 0 ? "border-l" : ""} ${
                        appliedPaletteName === p.name
                          ? "bg-teal-600 text-white hover:bg-teal-700"
                          : activePaletteName === p.name
                            ? "bg-muted font-medium hover:bg-muted"
                            : "bg-background hover:bg-muted"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Couleur de fond</Label>
              <ColorField
                id="sa-bg"
                value={draftCfg.superAdmin.bg || ""}
                placeholder="#0a0a0a"
                onChange={(next) => updateSuperAdmin({ bg: next })}
              />
            </div>
            <div className="space-y-2">
              <Label>Couleur du texte</Label>
              <ColorField
                id="sa-text"
                value={draftCfg.superAdmin.text || ""}
                placeholder="#22c55e"
                onChange={(next) => updateSuperAdmin({ text: next })}
              />
            </div>
            <div className="space-y-2">
              <Label>Fond sidebar</Label>
              <ColorField
                id="sa-sidebar"
                value={draftCfg.superAdmin.sidebarBg || ""}
                placeholder="#111111"
                onChange={(next) => updateSuperAdmin({ sidebarBg: next })}
              />
            </div>
            <div className="space-y-2">
              <Label>Fond header</Label>
              <ColorField
                id="sa-header"
                value={draftCfg.superAdmin.headerBg || ""}
                placeholder="#0d1b0d"
                onChange={(next) => updateSuperAdmin({ headerBg: next })}
              />
            </div>
            <div className="space-y-2">
              <Label>Fond surface (cards)</Label>
              <ColorField
                id="sa-surface"
                value={draftCfg.superAdmin.surface || ""}
                placeholder="#1a1a1a"
                onChange={(next) => updateSuperAdmin({ surface: next })}
              />
            </div>
            <div className="space-y-2">
              <Label>Couleur bordure</Label>
              <ColorField
                id="sa-border"
                value={draftCfg.superAdmin.border || ""}
                placeholder="#1a3a1a"
                onChange={(next) => updateSuperAdmin({ border: next })}
              />
            </div>
            <div className="space-y-2">
              <Label>Couleur accent</Label>
              <ColorField
                id="sa-accent"
                value={draftCfg.superAdmin.accent || ""}
                placeholder="#22c55e"
                onChange={(next) => updateSuperAdmin({ accent: next })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accueil (domaines)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Domaine</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
              >
                {domainesList.map((d) => (
                  <option key={d.id} value={d.nomDomaine}>
                    {d.nomDomaine}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Dégradé - début</Label>
                <ColorField
                  id="dom-from"
                  value={domainTheme.from || ""}
                  placeholder="#16a34a"
                  onChange={(next) => updateDomain({ from: next })}
                />
              </div>
              <div className="space-y-2">
                <Label>Dégradé - fin</Label>
                <ColorField
                  id="dom-to"
                  value={domainTheme.to || ""}
                  placeholder="#22c55e"
                  onChange={(next) => updateDomain({ to: next })}
                />
              </div>
              <div className="space-y-2">
                <Label>Icône</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={domainTheme.icon || ''}
                  onChange={(e) => updateDomain({ icon: e.target.value })}
                >
                  <option value="">(défaut)</option>
                  {DOMAIN_ICON_CHOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Logo (URL)</Label>
                <Input value={domainTheme.logoUrl || ""} onChange={(e) => updateDomain({ logoUrl: e.target.value })} placeholder="/logo.png" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Téléverser un logo / icône</Label>
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm"
                  onChange={(e) => onUploadDomainLogo(e.target.files?.[0] || null)}
                />
                {domainTheme.logoUrl ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={domainTheme.logoUrl} alt="preview" className="h-10 w-10 rounded bg-white object-contain" />
                    <Button type="button" variant="outline" onClick={() => updateDomain({ logoUrl: '' })}>
                      Enlever le logo
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Les changements s'appliquent automatiquement sur la page d'accueil.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

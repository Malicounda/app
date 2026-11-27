import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { departmentsByRegion } from '@/lib/constants';
import { apiRequest } from '@/lib/queryClient';
import { MapPin, Plus, ShieldCheck, Trash2, UserCheck } from 'lucide-react';

type AutoValidationMode = 'manual' | 'rules' | 'all';

type TerritoryRule = {
  id: number;
  region: string | null;
  departement: string | null;
  commune: string | null;
  enabled: boolean;
};

type EligibleAgent = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  region: string | null;
  departement: string | null;
  zone: string | null;
  autoValidateEnabled: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin Chasse',
  agent: 'Agent',
  'sub-agent': 'Sous-agent',
  'agent-regional': 'Agent Régional',
  'agent-departemental': 'Agent Départemental',
};

export function AutoValidationRulesTab() {
  const { toast } = useToast();
  const [region, setRegion] = useState('');
  const [departement, setDepartement] = useState('');
  const [commune, setCommune] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [savingMode, setSavingMode] = useState(false);
  const [addingTerritory, setAddingTerritory] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState<number | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<number | null>(null);

  const { data: resp, refetch, isLoading } = useQuery({
    queryKey: ['hunter-autovalidation-rules'],
    queryFn: async () =>
      apiRequest<any>({
        url: '/api/admin/autovalidation-rules',
        method: 'GET',
      }),
  });

  const config = (resp as any)?.data ?? {
    mode: 'manual' as AutoValidationMode,
    territoryRules: [] as TerritoryRule[],
    agents: [] as EligibleAgent[],
  };

  const currentMode: AutoValidationMode = config.mode || 'manual';
  const territoryRules: TerritoryRule[] = config.territoryRules || [];
  const agents: EligibleAgent[] = config.agents || [];

  const regionsList = useMemo(() => Object.keys(departmentsByRegion), []);
  const departmentsList = useMemo(() => {
    if (!region) return [];
    return (departmentsByRegion as Record<string, { value: string; label: string }[]>)[region] || [];
  }, [region]);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) =>
      `${a.firstName} ${a.lastName} ${a.username} ${a.role} ${a.region || ''} ${a.departement || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [agents, agentSearch]);

  const handleModeChange = async (nextMode: AutoValidationMode) => {
    try {
      setSavingMode(true);
      await apiRequest({
        url: '/api/admin/autovalidation-rules/mode',
        method: 'PUT',
        data: { mode: nextMode },
      });
      toast({
        title: 'Politique mise à jour',
        description:
          nextMode === 'manual'
            ? 'Validation manuelle obligatoire activée partout.'
            : nextMode === 'all'
            ? 'Auto-validation activée pour tous les agents et Admin Chasse.'
            : 'Auto-validation appliquée uniquement aux territoires et agents autorisés ci-dessous.',
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || 'Impossible de modifier le mode.',
        variant: 'destructive',
      });
    } finally {
      setSavingMode(false);
    }
  };

  const handleAddTerritory = async () => {
    if (!region) {
      toast({
        title: 'Région requise',
        description: 'Veuillez sélectionner une région.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setAddingTerritory(true);
      await apiRequest({
        url: '/api/admin/autovalidation-rules/territory',
        method: 'POST',
        data: {
          region,
          departement: departement && departement !== '__ALL__' ? departement : null,
          commune: commune.trim() || null,
        },
      });
      toast({
        title: 'Territoire autorisé',
        description: `Auto-validation ajoutée pour ${[region, departement !== '__ALL__' ? departement : null, commune.trim() || null].filter(Boolean).join(' · ')}.`,
      });
      setRegion('');
      setDepartement('');
      setCommune('');
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || "Impossible d'ajouter ce territoire.",
        variant: 'destructive',
      });
    } finally {
      setAddingTerritory(false);
    }
  };

  const handleToggleRule = async (rule: TerritoryRule) => {
    try {
      setBusyRuleId(rule.id);
      await apiRequest({
        url: `/api/admin/autovalidation-rules/${rule.id}`,
        method: 'PATCH',
        data: { enabled: !rule.enabled },
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || 'Impossible de modifier cette règle.',
        variant: 'destructive',
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      setBusyRuleId(ruleId);
      await apiRequest({
        url: `/api/admin/autovalidation-rules/${ruleId}`,
        method: 'DELETE',
      });
      toast({ title: 'Règle supprimée' });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || 'Impossible de supprimer cette règle.',
        variant: 'destructive',
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleToggleAgent = async (agent: EligibleAgent) => {
    try {
      setBusyAgentId(agent.id);
      await apiRequest({
        url: '/api/admin/autovalidation-rules/agent',
        method: 'POST',
        data: { userId: agent.id, enabled: !agent.autoValidateEnabled },
      });
      toast({
        title: !agent.autoValidateEnabled ? 'Délégation accordée' : 'Délégation retirée',
        description: !agent.autoValidateEnabled
          ? `Les dossiers saisis par ${agent.firstName || agent.username} ${agent.lastName} seront automatiquement validés.`
          : `Les dossiers saisis par ${agent.firstName || agent.username} ${agent.lastName} nécessiteront une validation manuelle.`,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err?.message || 'Impossible de modifier cette délégation.',
        variant: 'destructive',
      });
    } finally {
      setBusyAgentId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Politique globale par boutons radio */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Politique de validation des dossiers saisis par les agents
          </CardTitle>
          <CardDescription>
            Compétence exclusive du SuperAdmin. L&apos;<strong>Admin Chasse</strong> est également soumis à ces règles (non exempté).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {[
            {
              value: 'manual' as AutoValidationMode,
              title: 'Validation manuelle obligatoire partout (recommandé par défaut)',
              desc: 'Tout dossier saisi par un agent ou un Admin Chasse reste « En attente » jusqu’à validation manuelle.',
            },
            {
              value: 'rules' as AutoValidationMode,
              title: 'Délégation ciblée (par Région / Département / Commune et/ou par Agent spécifique)',
              desc: 'Seuls les territoires et/ou agents (y compris Admin Chasse) explicitement autorisés ci-dessous valident automatiquement leurs saisies.',
            },
            {
              value: 'all' as AutoValidationMode,
              title: 'Auto-validation activée partout',
              desc: 'Tous les dossiers saisis par un agent ou un Admin Chasse sont validés automatiquement dès leur création.',
            },
          ].map((opt) => {
            const active = currentMode === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${
                  active ? 'border-emerald-500 bg-emerald-50/60' : 'hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="autovalidation-mode"
                  checked={active}
                  disabled={savingMode || isLoading}
                  onChange={() => handleModeChange(opt.value)}
                  className="mt-1 h-4 w-4 accent-emerald-600 cursor-pointer"
                />
                <div className="text-sm">
                  <div className="font-semibold text-foreground">{opt.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </CardContent>
      </Card>

      {/* Grille 2 colonnes : Territoires & Agents spécifiques */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${currentMode !== 'rules' ? 'opacity-65' : ''}`}>
        {/* Règles par Territoire */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Délégation par Territoire (Région / Département / Commune)
            </CardTitle>
            <CardDescription>
              Autoriser l&apos;auto-validation des dossiers saisis dans une zone précise.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select
                value={region}
                onValueChange={(val) => {
                  setRegion(val);
                  setDepartement('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Région *" />
                </SelectTrigger>
                <SelectContent>
                  {regionsList.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={departement}
                onValueChange={setDepartement}
                disabled={!region}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Département (tous)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">Toute la région</SelectItem>
                  {departmentsList.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Commune / Zone (optionnel)"
                value={commune}
                onChange={(e) => setCommune(e.target.value)}
              />
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleAddTerritory}
              disabled={addingTerritory || !region}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              {addingTerritory ? 'Ajout...' : 'Autoriser ce territoire'}
            </Button>

            {territoryRules.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Aucun territoire autorisé pour le moment.
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                {territoryRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {[rule.region, rule.departement, rule.commune].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {rule.commune
                          ? 'Portée : Commune / Zone'
                          : rule.departement
                          ? 'Portée : Département entier'
                          : 'Portée : Région entière'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={rule.enabled ? 'secondary' : 'outline'}
                        disabled={busyRuleId === rule.id}
                        onClick={() => handleToggleRule(rule)}
                        className={`h-7 px-2 text-xs ${rule.enabled ? 'bg-emerald-100 text-emerald-800' : ''}`}
                      >
                        {rule.enabled ? 'Actif' : 'Inactif'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyRuleId === rule.id}
                        onClick={() => handleDeleteRule(rule.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Supprimer cette règle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Règles spécifiques par Agent (incluant Admin Chasse) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Délégation spécifique par Agent (Admin Chasse inclus)
            </CardTitle>
            <CardDescription>
              Autoriser individuellement un agent ou un Admin Chasse à auto-valider ses saisies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Rechercher un agent ou Admin Chasse (nom, identifiant, région)..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
            />

            <div className="border rounded-lg divide-y max-h-[340px] overflow-y-auto">
              {filteredAgents.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Aucun agent trouvé.
                </div>
              ) : (
                filteredAgents.map((agent) => {
                  const fullName = `${agent.firstName} ${agent.lastName}`.trim() || agent.username;
                  const roleLabel = ROLE_LABELS[String(agent.role || '').toLowerCase()] || agent.role;
                  const loc = [agent.region, agent.departement || agent.zone].filter(Boolean).join(' · ');
                  return (
                    <div key={agent.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{fullName}</span>
                          <Badge
                            variant={String(agent.role).toLowerCase() === 'admin' ? 'default' : 'outline'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {roleLabel}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{agent.username}
                          {loc ? ` · ${loc}` : ''}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={agent.autoValidateEnabled ? 'default' : 'outline'}
                        disabled={busyAgentId === agent.id}
                        onClick={() => handleToggleAgent(agent)}
                        className={`h-7 px-2.5 text-xs shrink-0 ${
                          agent.autoValidateEnabled ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                        }`}
                      >
                        {agent.autoValidateEnabled ? 'Autorisé' : 'Non autorisé'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

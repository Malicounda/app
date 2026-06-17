import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { TypePermisSpecial } from '@/types/permis';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from '@/lib/queryClient';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Shield, 
  FileCheck2, 
  ChevronRight, 
  Loader2, 
  CalendarDays,
  Bird,
  FileSpreadsheet
} from 'lucide-react';
import AgentTopHeader from '@/components/layout/AgentTopHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MyRequests from "@/pages/Permis/MyRequests";
export default function DemandePermisChasse() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : undefined);
  const tabParam = params.get('tab');
  const defaultTab = tabParam === 'list' ? 'list' : 'create';
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  const [editRequestId, setEditRequestId] = useState<number | null>(null);

  const [category, setCategory] = useState<'CYNEGETIQUE' | 'AUTRE' | ''>('');
  const [typePermis, setTypePermis] = useState<string>('');
  const [hunterProfile, setHunterProfile] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Dates d'expiration temporaires saisies par le chasseur avant l'upload
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});

  // ── Catégories dynamiques depuis l'API (même source que PermitForm.tsx) ──
  interface PermitCategoryOption {
    id: string;    // key de la catégorie (ex: 'resident-petite')
    name: string;  // label affiché (ex: 'Résident - Petite chasse')
    groupe: string;
    genre: string;
  }
  const [permitCategories, setPermitCategories] = useState<PermitCategoryOption[]>([]);
  const [filteredCynegetiques, setFilteredCynegetiques] = useState<PermitCategoryOption[]>([]);
  const [filteredAutres, setFilteredAutres] = useState<PermitCategoryOption[]>([]);

  const DOC_METADATA: Record<string, { label: string; requiresExpiry: boolean }> = {
    idCardDocument: { label: "Pièce d'identité (CNI ou Passeport)", requiresExpiry: true },
    weaponPermit: { label: "Permis de Port d'Arme", requiresExpiry: true },
    hunterPhoto: { label: "Photo d'identité", requiresExpiry: false },
    treasuryStamp: { label: "Timbre fiscal / Quittance", requiresExpiry: true },
    weaponReceipt: { label: "Reçu de l'Arme du Trésor", requiresExpiry: true },
    insurance: { label: "Attestation d'Assurance", requiresExpiry: true },
    moralCertificate: { label: "Certificat / Autre document justificatif", requiresExpiry: false },
  };

  // Liste des pièces selon la catégorie choisie
  const getRequiredDocsForCategory = () => {
    if (category === 'CYNEGETIQUE') {
      return ['idCardDocument', 'weaponPermit', 'insurance', 'hunterPhoto', 'treasuryStamp', 'weaponReceipt'];
    }
    if (category === 'AUTRE') {
      return ['moralCertificate'];
    }
    return [];
  };

  const fetchAttachments = async (hunterId: number) => {
    setLoadingAttachments(true);
    try {
      const [cynegetiqueData, autresData] = await Promise.all([
        apiRequest<any>({ url: `/api/attachments/${hunterId}`, method: 'GET' }).catch(() => ({ items: [] })),
        apiRequest<any>({ url: `/api/hunter-documents/${hunterId}`, method: 'GET' }).catch(() => ({ items: [] }))
      ]);
      
      // On ne garde que les documents RÉELLEMENT présents
      const cynegetiqueItems = (cynegetiqueData.items || [])
        .filter((i: any) => i.present)
        .map((i: any) => ({ ...i, source: 'CYNEGETIQUE' }));
        
      const autresItems = (autresData.items || [])
        .filter((i: any) => i.present)
        .map((i: any) => ({ ...i, source: 'AUTRE' }));
        
      setAttachments([...cynegetiqueItems, ...autresItems]);
    } catch (err) {
      console.error("Error loading attachments", err);
    } finally {
      setLoadingAttachments(false);
    }
  };

  // Charger le profil chasseur
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await apiRequest<any>({ url: '/api/hunters/me', method: 'GET' });
        setHunterProfile(profile);
      } catch (err: any) {
        if (err?.status !== 404) {
          console.warn("Network error loading profile", err);
        }
      }
    };
    if (user) {
      fetchProfile();
    }
  }, [user]);

  useEffect(() => {
    if (hunterProfile?.id) {
      fetchAttachments(hunterProfile.id);
    }
  }, [hunterProfile]);

  // ── Charger les catégories de permis depuis l'API (même endpoint que PermitForm) ──
  useEffect(() => {
    const fetchPermitCategories = async () => {
      try {
        const cats = await apiRequest<any[]>({ url: '/api/permit-categories?activeOnly=true', method: 'GET' });
        const mapped: PermitCategoryOption[] = (Array.isArray(cats) ? cats : []).map((c: any) => ({
          id: String(c.key),
          name: String(c.labelFr + (c.sousCategorie ? ` (${c.sousCategorie})` : '')),
          groupe: String(c.groupe || ''),
          genre: String(c.genre || ''),
        }));
        setPermitCategories(mapped);
      } catch (err) {
        console.error('[DemandePermisChasse] Erreur chargement catégories:', err);
      }
    };
    fetchPermitCategories();
  }, []);

  // ── Filtrer les catégories cynégétiques selon la catégorie du chasseur et autres permis ──
  useEffect(() => {
    if (permitCategories.length === 0) {
      setFilteredCynegetiques([]);
      setFilteredAutres([]);
      return;
    }

    const isCynegetiqueGroup = (g: string) =>
      ['petite-chasse', 'grande-chasse', 'gibier-eau', 'coutumier'].includes(g.toLowerCase().trim());

    // 1. Filtrer pour les autres permis (hors groupes cynégétiques)
    const autresFiltered = permitCategories.filter(c => !isCynegetiqueGroup(c.groupe));
    setFilteredAutres(autresFiltered);

    // 2. Filtrer pour cynégétique
    if (!hunterProfile?.category) {
      setFilteredCynegetiques([]);
      return;
    }
    const hunterCat = hunterProfile.category.toLowerCase();
    let filtered: PermitCategoryOption[];
    switch (hunterCat) {
      case 'resident':
        filtered = permitCategories.filter(c =>
          c.id.includes('resident') && !c.id.includes('coutumier') && !c.id.includes('touriste')
        );
        break;
      case 'coutumier':
        filtered = permitCategories.filter(c => c.id.includes('coutumier'));
        break;
      case 'touriste':
      case 'touristique':
        filtered = permitCategories.filter(c => c.id.includes('touriste'));
        break;
      default:
        filtered = [...permitCategories];
    }
    setFilteredCynegetiques(filtered.filter(c => isCynegetiqueGroup(c.groupe)));
  }, [hunterProfile, permitCategories]);

  const handleUpload = async (docCode: string, file: File) => {
    if (!hunterProfile?.id) return;
    
    const requiresExpiry = DOC_METADATA[docCode]?.requiresExpiry;
    const expiryDate = expiryDates[docCode];

    if (requiresExpiry && !expiryDate) {
      toast({
        variant: "destructive",
        title: "Date d'expiration requise",
        description: `Veuillez spécifier la date d'expiration pour ce document.`
      });
      return;
    }

    const finalDocCode = category === 'AUTRE' ? `${docCode}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : docCode;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', finalDocCode);
    if (expiryDate) {
      formData.append('expiryDate', expiryDate);
    }

    try {
      setLoadingAttachments(true);
      const endpoint = category === 'AUTRE' 
        ? `/api/hunter-documents/${hunterProfile.id}` 
        : `/api/attachments/${hunterProfile.id}`;
        
      await apiRequest<any>({
        url: endpoint,
        method: 'POST',
        data: formData
      });
      toast({ title: "Succès", description: "Document téléversé avec succès." });
      await fetchAttachments(hunterProfile.id);
    } catch (err: any) {
      console.error("Upload error", err);
      toast({ variant: "destructive", title: "Erreur", description: err.message || "Échec du téléversement." });
    } finally {
      setLoadingAttachments(false);
    }
  };

  const handleDeleteDoc = async (docCode: string) => {
    if (!hunterProfile?.id) return;
    try {
      setLoadingAttachments(true);
      
      // On détermine la source depuis l'état actuel ou la catégorie
      const doc = attachments.find(a => a.type === docCode);
      const isAutre = doc?.source === 'AUTRE' || category === 'AUTRE';
      const endpoint = isAutre 
        ? `/api/hunter-documents/${hunterProfile.id}/${docCode}` 
        : `/api/attachments/${hunterProfile.id}/${docCode}`;

      await apiRequest<any>({
        url: endpoint,
        method: 'DELETE'
      });
      toast({ title: "Succès", description: "Document supprimé avec succès." });
      await fetchAttachments(hunterProfile.id);
    } catch (err: any) {
      console.error("Delete error", err);
      toast({ variant: "destructive", title: "Erreur", description: err.message || "Échec de la suppression." });
    } finally {
      setLoadingAttachments(false);
    }
  };

  const submitWithStatus = async (status: 'pending' | 'draft') => {
    if (!typePermis) {
      setError('Veuillez sélectionner un type de permis');
      return;
    }

    // Vérifier si toutes les pièces jointes de la catégorie sont présentes, seulement pour la soumission finale
    const requiredDocs = getRequiredDocsForCategory();
    const missingDocs = requiredDocs.filter(docCode => !attachments.some(a => a.type.startsWith(docCode) && a.source === category));

    if (status === 'pending' && missingDocs.length > 0) {
      setError(`Veuillez téléverser tous les documents obligatoires avant de soumettre.`);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await apiRequest<any>({
        url: '/api/permit-requests/request',
        method: 'POST',
        data: {
          id: editRequestId,
          status: status,
          permitType: typePermis,
          requestedType: typePermis,
          requestedCategory: category === 'CYNEGETIQUE' 
            ? (hunterProfile?.category || 'resident') 
            : 'autre'
        }
      });

      toast({
        title: status === 'draft' ? "Brouillon enregistré" : "Demande soumise !",
        description: status === 'draft' 
          ? "Votre demande a été sauvegardée en brouillon." 
          : "Votre demande de permis a été transmise avec succès aux services forestiers."
      });

      setEditRequestId(null);
      setActiveTab('list');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue lors du traitement de la demande.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Default to pending if submitted via normal form submit
    submitWithStatus('pending');
  };

  const handleEditRequest = (req: any) => {
    setActiveTab('create');
    setEditRequestId(req.id);
    setCategory(req.requestedCategory === 'autre' ? 'AUTRE' : 'CYNEGETIQUE');
    setTypePermis(req.requestedType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  const requiredDocs = getRequiredDocsForCategory();

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <AgentTopHeader />
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain pb-24">
        <div className="container mx-auto py-8 px-4 max-w-3xl">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">Demandes de Permis</h1>
              <TabsList className="grid w-full grid-cols-2 sm:flex sm:w-auto bg-slate-100/80 p-1.5 rounded-xl shadow-inner">
                <TabsTrigger value="create" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm font-semibold py-2">Nouvelle demande</TabsTrigger>
                <TabsTrigger value="list" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm font-semibold py-2">Mes demandes</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="create" className="m-0 focus-visible:outline-none focus-visible:ring-0">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Card className="border-slate-100 shadow-xl shadow-slate-100/50 bg-white/90 backdrop-blur-md">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-extrabold text-slate-800">Demande de Permis Simplifiée</CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500 mt-0.5">
                      Soumettez votre demande et vos pièces justificatives en quelques instants.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Étape 1 : Choix de la Catégorie (Cartes Premium) */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">1. Catégorie de Permis</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Permis Cynégétique */}
                      <div
                        onClick={() => {
                          setCategory('CYNEGETIQUE');
                          setTypePermis('');
                        }}
                        className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-300 flex items-start gap-4 ${
                          category === 'CYNEGETIQUE'
                            ? 'border-emerald-500 bg-emerald-50/40 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          category === 'CYNEGETIQUE' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="block font-bold text-slate-800 text-sm">Permis Cynégétiques</span>
                          <span className="block text-[11px] font-medium text-slate-500 mt-1">
                            Petite chasse (Résident/Coutumier), Grande chasse, Gibier d'eau.
                          </span>
                        </div>
                      </div>

                      {/* Autres Permis */}
                      <div
                        onClick={() => {
                          setCategory('AUTRE');
                          setTypePermis('');
                        }}
                        className={`cursor-pointer rounded-2xl border-2 p-5 transition-all duration-300 flex items-start gap-4 ${
                          category === 'AUTRE'
                            ? 'border-emerald-500 bg-emerald-50/40 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          category === 'AUTRE' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Bird className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="block font-bold text-slate-800 text-sm">Autres Permis & Certificats</span>
                          <span className="block text-[11px] font-medium text-slate-500 mt-1">
                            Capture commerciale, Oisellier, Scientifique, Exportation, Détention.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Étape 2 : Choix du Type de Permis (chargé dynamiquement depuis l'API, filtré par catégorie chasseur) */}
                  <AnimatePresence>
                    {category && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <Label htmlFor="typePermis" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            2. Type de Permis / Titre spécifique
                          </Label>
                          {category === 'CYNEGETIQUE' && hunterProfile?.category && (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              hunterProfile.category === 'touriste'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : hunterProfile.category === 'coutumier'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              <Shield className="h-3 w-3" />
                              Catégorie : {hunterProfile.category === 'resident' ? 'Résident' : hunterProfile.category === 'coutumier' ? 'Coutumier' : 'Touriste'}
                            </span>
                          )}
                        </div>
                        <Select
                          value={typePermis}
                          onValueChange={(value: string) => setTypePermis(value)}
                        >
                          <SelectTrigger className="w-full rounded-xl border-slate-200 h-11 bg-white shadow-sm focus:ring-emerald-500">
                            <SelectValue placeholder="Sélectionnez l'autorisation ou permis exact" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-slate-100 shadow-lg">
                            {category === 'CYNEGETIQUE' ? (
                              filteredCynegetiques.length > 0 ? (
                                filteredCynegetiques.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  Aucune catégorie disponible pour votre profil.
                                </div>
                              )
                            ) : (
                              filteredAutres.length > 0 ? (
                                filteredAutres.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  Aucune option de permis spécial disponible.
                                </div>
                              )
                            )}
                          </SelectContent>
                        </Select>

                        {/* Info contextuelle sur la catégorie détectée */}
                        {category === 'CYNEGETIQUE' && hunterProfile?.category && (
                          <p className="text-[11px] text-slate-400 font-medium pl-1">
                            Les types de permis ci-dessus correspondent à votre catégorie « {hunterProfile.category === 'resident' ? 'Résident' : hunterProfile.category === 'coutumier' ? 'Coutumier' : 'Touriste'} » renseignée lors de votre inscription.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Étape 3 : Pièces justificatives */}
                  <AnimatePresence>
                    {category && typePermis && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4 pt-2 border-t border-slate-100"
                      >
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            3. Pièces Justificatives Obligatoires
                          </Label>
                          {loadingAttachments && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                              <span>Mise à jour...</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3.5">
                          {requiredDocs.map((docCode) => {
                            const meta = DOC_METADATA[docCode];
                            if (!meta) return null;
                            const uploadedDocs = attachments.filter(a => a.type.startsWith(docCode) && a.source === category);
                            const isPresent = uploadedDocs.length > 0;

                            return (
                              <div
                                key={docCode}
                                className={`p-4 rounded-2xl border transition-all ${
                                  isPresent
                                    ? 'bg-emerald-50/20 border-emerald-100'
                                    : 'bg-white border-slate-100 shadow-sm'
                                }`}
                              >
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                      <span className="text-sm font-bold text-slate-700">{meta.label}</span>
                                    </div>
                                    
                                    {/* Affichage des documents uploadés (supporte plusieurs pour AUTRE) */}
                                    {uploadedDocs.map((att: any) => (
                                      <div key={att.type} className="flex items-center gap-2 pl-6">
                                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none rounded-full px-2 py-0.5 text-[9px] font-bold">
                                          Chargé
                                        </Badge>
                                        <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{att.name}</span>
                                        {att.expiryDate && (
                                          <span className="text-[10px] font-medium text-slate-400">
                                            (Exp: {new Date(att.expiryDate).toLocaleDateString('fr-FR')})
                                          </span>
                                        )}
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteDoc(att.type)}
                                          className="h-5 px-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="flex flex-col items-end gap-3 mt-2 md:mt-0">
                                    {/* Saisie de la date d'expiration si requise */}
                                    {meta.requiresExpiry && (!isPresent || category === 'AUTRE') && (
                                      <div className="flex flex-col gap-1 items-end">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                          <CalendarDays className="h-3 w-3" /> Expire le (si applicable)
                                        </span>
                                        <Input
                                          type="date"
                                          className="h-8 rounded-lg text-xs w-32 border-slate-200"
                                          value={expiryDates[docCode] || ''}
                                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpiryDates(prev => ({ ...prev, [docCode]: e.target.value }))}
                                        />
                                      </div>
                                    )}

                                    {/* Bouton de téléchargement, toujours visible si c'est AUTRE, ou caché si c'est CYNEGETIQUE et déjà uploadé */}
                                    {(!isPresent || category === 'AUTRE') && (
                                      <div className="relative">
                                        <input
                                          type="file"
                                          multiple={category === 'AUTRE'}
                                          accept=".pdf,.jpg,.jpeg,.png"
                                          className="hidden"
                                          id={`upload-${docCode}`}
                                          onChange={async (e) => {
                                            const files = Array.from(e.target.files || []);
                                            // Upload sequentially to avoid race conditions and toast spam
                                            for (const file of files) {
                                              await handleUpload(docCode, file);
                                            }
                                          }}
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          asChild
                                          className="h-8 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 border-emerald-100 hover:border-emerald-200 text-xs font-bold gap-1.5"
                                        >
                                          <label htmlFor={`upload-${docCode}`} className="cursor-pointer">
                                            <Upload className="h-3.5 w-3.5" /> {category === 'AUTRE' && isPresent ? 'Ajouter un document' : 'Téléverser'}
                                          </label>
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>

            {/* Actions de bas de page */}
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {editRequestId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditRequestId(null);
                    setCategory('');
                    setTypePermis('');
                  }}
                  disabled={isSubmitting}
                  className="rounded-xl border-slate-200 text-slate-600 h-11 px-6 font-bold"
                >
                  Annuler l'édition
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => submitWithStatus('draft')}
                disabled={isSubmitting || !typePermis}
                className="rounded-xl border-slate-200 text-slate-700 h-11 px-6 font-bold bg-white hover:bg-slate-50"
              >
                Enregistrer comme brouillon
              </Button>
              <Button
                type="button"
                onClick={() => submitWithStatus('pending')}
                disabled={isSubmitting || !typePermis || requiredDocs.filter(d => !attachments.some(a => a.type.startsWith(d) && a.source === category)).length > 0}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold h-11 px-8 shadow-lg shadow-emerald-500/25 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    {editRequestId ? 'Renvoyer la demande' : 'Soumettre la demande'}
                    <ChevronRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
        </TabsContent>

        <TabsContent value="list" className="m-0 focus-visible:outline-none focus-visible:ring-0">
          <MyRequests onEditRequest={handleEditRequest} />
        </TabsContent>
      </Tabs>
    </div>
      </div>
    </div>
  );
}

// Composant Badge local simple pour éviter les soucis d'import
function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

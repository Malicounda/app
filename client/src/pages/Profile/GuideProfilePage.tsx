import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequestBlob } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import "@/styles/profile.css"; // Importer un style spécifique pour la page de profil
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    Edit,
    Loader2,
    LogOut,
    X
} from "lucide-react";
import { useEffect, useState } from "react";

export default function GuideProfilePage() {
    const { user, logout } = useAuth();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [editMode, setEditMode] = useState(false);

    useEffect(() => {
        document.title = "Profil Guide de Chasse | SCoDiPP_Ch";
    }, []);

    // Typage des données du guide
    interface GuideProfileData {
        id?: string | number;
        firstName?: string;
        lastName?: string;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
        dateOfBirth?: string | null;
        idNumber?: string | null;
        pays?: string | null;
        nationality?: string | null;
        profession?: string | null;
        experience?: number | null;
        certificationNumber?: string | null;
        certificationDate?: string | null;
        areasOfExpertise?: string | null;
        languagesSpoken?: string | null;
        equipmentType?: string | null;
        equipmentDetails?: string | null;
        region?: string | null;
        zone?: string | null;
        photo?: string | null;
        createdAt?: string | null;
    }

    // Récupérer les informations détaillées du guide
    const { data: guideData, isLoading } = useQuery<GuideProfileData>({
        queryKey: ['/api/guides', user?.id],
        queryFn: () => apiRequest<GuideProfileData>({
            url: `/api/guides/${user?.id}`,
            method: 'GET',
        }),
        enabled: !!user?.id,
    });

    // Ajouter un log pour voir les données récupérées
    useEffect(() => {
        if (guideData) {
            console.log("Données du guide récupérées:", guideData);
        }
    }, [guideData]);

    // État du formulaire
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: "",
        dateOfBirth: "",
        idNumber: "",
        nationality: "",
        profession: "",
        experience: 0,
        // Spécificités des guides
        certificationNumber: "",
        certificationDate: "",
        areasOfExpertise: "",
        languagesSpoken: "",
        // Informations sur l'équipement
        equipmentType: "",
        equipmentDetails: ""
    });

    // Mise à jour des données du formulaire
    useEffect(() => {
        if (user) {
            const gd = (guideData || {}) as GuideProfileData;
            setFormData({
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                email: user.email || "",
                phone: (gd.phone || "") as string,
                address: (gd.address || "") as string,
                dateOfBirth: gd.dateOfBirth ? new Date(gd.dateOfBirth).toISOString().split('T')[0] : "",
                idNumber: (gd.idNumber || "") as string,
                nationality: (gd.pays || "Sénégalaise") as string,
                profession: (gd.profession || "") as string,
                experience: (gd.experience ?? 0) || 0,
                // Spécificités des guides
                certificationNumber: (gd.certificationNumber || "") as string,
                certificationDate: (gd.certificationDate || "") as string,
                areasOfExpertise: (gd.areasOfExpertise || "") as string,
                languagesSpoken: (gd.languagesSpoken || "") as string,
                // Informations sur l'équipement
                equipmentType: (gd.equipmentType || "") as string,
                equipmentDetails: (gd.equipmentDetails || "") as string
            });
        }
    }, [user, guideData]);

    // Mutation pour mettre à jour le profil du guide
    const updateMutation = useMutation({
        mutationFn: (data: any) => apiRequest({
            url: `/api/guides/${user?.guideId}`,
            method: 'PUT',
            data
        }),
        onSuccess: () => {
            toast({
                title: "Profil mis à jour",
                description: "Vos informations ont été enregistrées avec succès.",
            });
            setEditMode(false);
            queryClient.invalidateQueries({ queryKey: ['/api/guides', user?.guideId] });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.message || "Une erreur est survenue lors de la mise à jour du profil.",
                variant: "destructive",
            });
        }
    });

    // Handler pour soumettre le formulaire
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateMutation.mutate(formData);
    };

    // Handler pour les changements dans le formulaire
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Préparer dès maintenant un fallback blob pour la photo afin de ne pas violer l'ordre des hooks
    const [blobUrl, setBlobUrl] = useState<string>("");
    const guideId: string | number | undefined = (guideData as any)?.id ?? (guideData as any)?.guideId;
    const photoOwnerId = guideId ?? user?.id;
    const photoEndpointBase = photoOwnerId ? `/api/guides/${photoOwnerId}/photo` : "";
    useEffect(() => {
        let revoke: string | null = null;
        (async () => {
            if (!photoEndpointBase) {
                console.log('Aucun endpoint de photo disponible');
                return;
            }
            
            console.log('Tentative de chargement de la photo depuis:', photoEndpointBase);
            
            // Essai 1: endpoint standard
            try {
                const res = await apiRequestBlob(`${photoEndpointBase}?t=${Date.now()}`, 'GET');
                console.log('Réponse endpoint standard:', { ok: res.ok, blobSize: res.blob?.size });
                
                if (res.ok && res.blob && res.blob.size > 0) {
                    const url = URL.createObjectURL(res.blob);
                    console.log('Blob URL créé avec succès:', url.substring(0, 50) + '...');
                    setBlobUrl((old) => { 
                        if (old) {
                            console.log('Révocation de l\'ancien blob URL');
                            URL.revokeObjectURL(old); 
                        }
                        return url; 
                    });
                    revoke = url;
                    return;
                }
            } catch (error) {
                console.warn('Erreur endpoint standard:', error);
            }
            
            // Essai 2: endpoint alternatif
            try {
                const alt = `/api/guides/photo/${photoOwnerId}`;
                console.log('Tentative endpoint alternatif:', alt);
                
                const res2 = await apiRequestBlob(`${alt}?t=${Date.now()}`, 'GET');
                console.log('Réponse endpoint alternatif:', { ok: res2.ok, blobSize: res2.blob?.size });
                
                if (res2.ok && res2.blob && res2.blob.size > 0) {
                    const url = URL.createObjectURL(res2.blob);
                    console.log('Blob URL alternatif créé avec succès:', url.substring(0, 50) + '...');
                    setBlobUrl((old) => { 
                        if (old) {
                            console.log('Révocation de l\'ancien blob URL');
                            URL.revokeObjectURL(old); 
                        }
                        return url; 
                    });
                    revoke = url;
                } else {
                    console.log('Aucune photo trouvée via les endpoints blob');
                }
            } catch (error) {
                console.warn('Erreur endpoint alternatif:', error);
                console.log('Aucune photo blob disponible, utilisation du fallback');
            }
        })();
        return () => {
            if (revoke) {
                console.log('Nettoyage du blob URL à la destruction du composant');
                URL.revokeObjectURL(revoke);
            }
        };
    }, [photoEndpointBase, photoOwnerId]);

    // Ne pas faire de return anticipé ici pour préserver l'ordre des hooks.

    // Résolution robuste de la photo (string, objet {url|path}, tableau de strings, etc.)
    const decodePhoto = (raw: any): string => {
        if (!raw) return "";

        // Cas spécial: si c'est un Buffer (bytea de PostgreSQL), on laisse le blob s'en charger
        if (raw && typeof raw === 'object' && raw.type === "Buffer" && Array.isArray(raw.data)) {
            console.log('Photo détectée comme Buffer PostgreSQL, utilisation du blob endpoint');
            return "";
        }

        // Si c'est null, undefined, ou une chaîne vide
        if (raw === null || raw === undefined || raw === '') {
            console.log('Photo vide ou nulle détectée');
            return "";
        }

        const apiUrl = (import.meta as any)?.env?.VITE_API_URL || '/api';
        let serverOrigin = window.location.origin;
        try {
            const u = new URL(apiUrl, window.location.origin);
            serverOrigin = `${u.protocol}//${u.host}`;
        } catch {}

        let v = "";
        if (typeof raw === "string") {
            v = raw;
        } else if (raw && typeof raw === "object") {
            if (typeof raw.url === "string") v = raw.url;
            else if (typeof raw.path === "string") v = raw.path;
            else if (typeof raw.filename === "string") v = raw.filename;
        } else if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
            v = raw[0];
        }

        if (!v) {
            console.log('Aucune URL de photo valide trouvée dans:', raw);
            return "";
        }
        
        const s = v.trim();
        if (!s) return "";

        console.log('Processing photo URL:', s);

        // Si c'est une data URL (base64)
        if (s.startsWith("data:")) {
            console.log('Photo détectée comme data URL base64');
            return s;
        }

        // Si c'est une URL absolue
        if (/^https?:\/\//i.test(s)) {
            console.log('Photo détectée comme URL absolue');
            return s;
        }

        // Éviter d'utiliser des endpoints protégés /api/* dans <img>
        if (s.startsWith("/api/")) {
            console.log('Photo détectée comme endpoint API, ignorée pour éviter les problèmes d\'authentification');
            return "";
        }

        // Si chemin root-relatif déjà fourni
        if (s.startsWith("/")) {
            const fullUrl = `${serverOrigin}${s}`;
            console.log('Photo détectée comme chemin absolu, URL finale:', fullUrl);
            return fullUrl;
        }

        // Si déjà un chemin 'uploads/...' sans slash initial
        if (s.toLowerCase().startsWith("uploads/")) {
            const fullUrl = `${serverOrigin}/${s}`;
            console.log('Photo détectée comme chemin uploads, URL finale:', fullUrl);
            return fullUrl;
        }

        // Par défaut: stocké à la racine des uploads
        const fullUrl = `${serverOrigin}/uploads/${s}`;
        console.log('Photo par défaut dans uploads, URL finale:', fullUrl);
        return fullUrl;
    };

    // La photo de profil doit provenir en priorité de la colonne `photo` de `hunting_guides` (guideData.photo)
    const primaryPhoto = decodePhoto(guideData?.photo) || decodePhoto((user as any)?.photo);
    // Prioriser le blob (DB stocke bytea), puis fallback sur un chemin décodé
    // Si aucune source n'est disponible, on laisse photoSrc vide pour que le fallback s'affiche
    const photoSrc = blobUrl || primaryPhoto || "";

    // Logs de débogage pour le chargement de la photo
    useEffect(() => {
        console.group('Chargement de la photo du guide');
        console.log('Guide ID:', guideId);
        console.log('User ID:', user?.id);
        console.log('Données brutes de la photo:', guideData?.photo);
        console.log('URL du blob:', blobUrl);
        console.log('URL finale de la photo:', photoSrc);
        console.groupEnd();

        // Vérifier si le blob est chargé mais pas affiché
        if (blobUrl && !photoSrc) {
            console.warn('Blob chargé mais non utilisé. Vérifiez la logique de priorité.');
        }
    }, [guideId, user?.id, guideData?.photo, blobUrl, photoSrc]);

// Rendu du composant
    if (isLoading) {
        return (
            <div className="p-4 md:p-8 pt-6">
                <div className="flex-1 p-8 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 pt-6">
            {editMode && (
                <Card className="border-amber-200 bg-amber-50 mb-6">
                    <CardHeader className="pb-2">
                        <CardTitle>Compléter votre profil</CardTitle>
                        <CardDescription>Ces informations amélioreront votre profil guide de chasse</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-amber-700 mb-3">
                            Certaines informations de votre profil sont incomplètes. Veuillez les renseigner ci-dessous.
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="w-full">
                    <CardHeader className="flex flex-col sm:flex-row items-center sm:items-center sm:justify-between gap-3 sm:gap-0 text-center sm:text-left py-3">
                        <CardTitle className="text-xl font-semibold">Mon Profil Guide de Chasse</CardTitle>
                        {!editMode ? (
                            <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="w-full sm:w-auto">
                                <Edit className="mr-1 h-3 w-3" />
                                Modifier
                            </Button>
                        ) : (
                            <div className="flex gap-2 w-full sm:w-auto justify-center">
                                <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="w-full sm:w-auto">
                                    <X className="mr-1 h-3 w-3" />
                                    Annuler
                                </Button>
                                <Button size="sm" onClick={handleSubmit} className="w-full sm:w-auto">
                                    <Check className="mr-1 h-3 w-3" />
                                    Enregistrer
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="flex flex-col items-center col-span-1">
                                    <div className="h-36 w-36 sm:h-40 sm:w-40 mb-4 rounded-full overflow-hidden border-4 border-white shadow-lg">
                                        <Avatar className="w-full h-full">
                                            <AvatarImage
                                                src={photoSrc}
                                                alt={`${guideData?.firstName || ''} ${guideData?.lastName || ''}`}
                                                className="w-full h-full object-cover"
                                                debug={true}
                                                onError={(e) => {
                                                    console.error('Erreur de chargement de l\'image de profil:', {
                                                        src: photoSrc,
                                                        error: e,
                                                        blobUrl,
                                                        primaryPhoto,
                                                        guideData: guideData ? {
                                                            id: guideData.id || 'inconnu',
                                                            hasPhoto: !!guideData.photo,
                                                            photoType: typeof guideData.photo
                                                        } : 'no guideData'
                                                    });
                                                }}
                                            />
                                            <AvatarFallback className="w-full h-full flex items-center justify-center bg-green-100">
                                                <span className="text-5xl font-bold text-green-800">
                                                    {user?.firstName?.charAt(0) || guideData?.firstName?.charAt(0) || 'G'}
                                                    {user?.lastName?.charAt(0) || guideData?.lastName?.charAt(0) || 'P'}
                                                </span>
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                    <h3 className="text-xl font-semibold">
                                        {user?.firstName || guideData?.firstName || 'Prénom'} {user?.lastName || guideData?.lastName || 'NOM'}
                                    </h3>
                                    <p className="text-gray-500 mb-4">Guide de Chasse</p>

                                    <div className="w-full space-y-4 mt-4">
                                        <div className="border rounded-md p-3">
                                            <h4 className="font-medium mb-2">Région d'activité</h4>
                                            <p>{user?.region || guideData?.region || 'Non spécifié'}</p>
                                        </div>

                                        <div className="border rounded-md p-3">
                                            <h4 className="font-medium mb-2">Département</h4>
                                            <p>{(user as any)?.departement || guideData?.zone || 'Non spécifié'}</p>
                                        </div>

                                        <div className="border rounded-md p-3">
                                            <h4 className="font-medium mb-2">Numéro d'identité</h4>
                                            <p>{guideData?.idNumber || 'Non spécifié'}</p>
                                        </div>

                                        <div className="border rounded-md p-3">
                                            <h4 className="font-medium mb-2">Date d'enregistrement</h4>
                                            <p>{guideData?.createdAt ? new Date(guideData.createdAt).toLocaleDateString() : 'Non spécifié'}</p>
                                        </div>

                                    </div>
                                </div>

                                <div className="lg:col-span-2">
                                    <h3 className="text-lg font-medium mb-6">Informations personnelles</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Prénom</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.firstName}
                                                name="firstName"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                            />
                                        </div>
                                        <div>
                                            <Label>Nom</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.lastName}
                                                name="lastName"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                            />
                                        </div>

                                        <div>
                                            <Label>Email</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.email}
                                                name="email"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                            />
                                        </div>
                                        <div>
                                            <Label>Téléphone</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.phone}
                                                name="phone"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <Label>Adresse</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.address}
                                                name="address"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                            />
                                        </div>

                                        <div>
                                            <Label>Expérience (années)</Label>
                                            <Input
                                                className="mt-1"
                                                type="number"
                                                min="0"
                                                value={formData.experience.toString()}
                                                name="experience"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                            />
                                        </div>
                                        <div>
                                            <Label>Langues parlées</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.languagesSpoken}
                                                name="languagesSpoken"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                                placeholder="Exemple: Français, Wolof, Pulaar"
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <Label>Spécialités</Label>
                                            <Input
                                                className="mt-1"
                                                value={formData.areasOfExpertise}
                                                name="areasOfExpertise"
                                                onChange={handleChange}
                                                disabled={!editMode}
                                                placeholder="Exemple: Chasse au phacochère, pistage, grande faune"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end">
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={updateMutation.isPending}
                                            className="w-full sm:w-auto"
                                        >
                                            {updateMutation.isPending ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Enregistrement...
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="h-4 w-4 mr-2" />
                                                    Enregistrer
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="mt-8 pt-6 border-t border-gray-100 pb-10 flex flex-col items-center">
                <Button
                    variant="destructive"
                    className="w-full max-w-xs gap-2 shadow-lg"
                    onClick={logout}
                >
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                </Button>
                <p className="mt-4 text-[10px] text-gray-400">Version 1.0.0</p>
            </div>
        </div>
    );
}

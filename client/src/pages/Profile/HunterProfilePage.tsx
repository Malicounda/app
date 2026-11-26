import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Save, Edit, Check, X, Briefcase, Target, LogOut,
  UserRound, Calendar, BadgeCheck, Mail, Phone, MapPin, Clock, Eye, EyeOff, Pencil,
  Camera, Upload, Loader2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiRequestBlob } from "@/lib/api";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import CameraCaptureModal from "@/components/messaging/CameraCaptureModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { regionEnum } from "@/lib/constants";

// Données retournées par /api/hunters/me (tous champs optionnels par sécurité)
interface HunterProfileData {
  id?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  idNumber?: string | null;
  pays?: string | null;
  nationality?: string | null;
  profession?: string | null;
  experience?: number | null;
  category?: string | null;
  region?: string | null;
  zone?: string | null;
  weaponType?: string | null;
  weaponBrand?: string | null;
  customWeaponBrand?: string | null;
  weaponReference?: string | null;
  weaponCaliber?: string | null;
  weaponOtherDetails?: string | null;
}

export default function HunterProfilePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false); // Mode d'édition désactivé pour les chasseurs

  // Récupérer les informations détaillées du chasseur
  const { data: hunterData, isLoading } = useQuery<HunterProfileData | null>({
    queryKey: ['/api/hunters/me'],
    queryFn: async () => {
      try {
        return await apiRequest<HunterProfileData>({
          url: '/api/hunters/me',
          method: 'GET',
        });
      } catch (err: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('chasseur non trouvé') || msg.includes('aucun profil chasseur') || err?.status === 404) {
          // Treat "hunter not found" as no profile for the current user
          return null;
         }
        throw err;
      }
    },
    enabled: Boolean(user?.hunterId), // Only fetch if user has hunterId
  });

  // URL de l'avatar (blob sécurisé)
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Statut des pièces jointes pour déterminer l'avatar (Photo du Chasseur)
  const hunterId = (user as any)?.hunterId ?? (hunterData as any)?.id;
  const { data: attachmentsStatus } = useQuery<{ updatedAt: string | null; items: Array<{ type: string; present: boolean }> }, Error>({
    queryKey: ['/api/attachments', hunterId],
    queryFn: () => apiRequest({
      url: `/api/attachments/${hunterId}`,
      method: 'GET',
    }),
    enabled: Boolean(hunterId),
  });

  // Écouter les mises à jour de photo depuis Documents ou Profil
  useEffect(() => {
    const onPhotoUpdated = () => {
      setPhotoVersion((v) => v + 1);
      if (hunterId) {
        queryClient.invalidateQueries({ queryKey: ['/api/attachments', hunterId] });
      }
    };
    window.addEventListener('hunter:photo-updated', onPhotoUpdated);
    return () => window.removeEventListener('hunter:photo-updated', onPhotoUpdated);
  }, [hunterId, queryClient]);

  // Téléverser directement la Photo du Chasseur depuis le profil (caméra ou fichier)
  const handleUploadHunterPhoto = async (file: File) => {
    if (!hunterId) {
      toast({ title: "Profil incomplet", description: "Veuillez d'abord compléter votre profil chasseur.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Fichier invalide", description: "Veuillez sélectionner une image (JPG ou PNG).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image trop volumineuse", description: "La taille maximale est de 5 Mo.", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    setPhotoMenuOpen(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", "hunterPhoto");
      const res = await authenticatedFetch(`/api/attachments/${hunterId}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.message || "Échec de l'enregistrement de la photo.");
      }
      const localPreview = URL.createObjectURL(file);
      setAvatarUrl(localPreview);
      await queryClient.invalidateQueries({ queryKey: ['/api/attachments', hunterId] });
      await queryClient.invalidateQueries({ queryKey: ['hunter-documents'] });
      window.dispatchEvent(new CustomEvent('hunter:photo-updated'));
      toast({ title: "Photo mise à jour", description: "Votre photo de profil a été enregistrée avec succès." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Impossible d'enregistrer la photo.", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (photoFileInputRef.current) photoFileInputRef.current.value = "";
    }
  };

  // Charger la photo du chasseur de manière authentifiée et générer un blob URL
  useEffect(() => {
    let prevUrl: string | null = null;
    const hasPhoto = attachmentsStatus?.items?.some(i => i.type === 'hunterPhoto' && i.present);
    if (hunterId && (hasPhoto || photoVersion > 0)) {
      (async () => {
        try {
          const res = await apiRequestBlob(`/attachments/${hunterId}/hunterPhoto?inline=1`, 'GET');
          if (res.ok && res.blob && res.blob.size > 0) {
            const url = URL.createObjectURL(res.blob);
            prevUrl = url;
            setAvatarUrl(url);
          } else {
            setAvatarUrl("");
          }
        } catch (_) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', _);
          setAvatarUrl("");
         }
      })();
    } else {
      setAvatarUrl("");
    }
    return () => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [hunterId, attachmentsStatus?.updatedAt, photoVersion]);

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
    // region: "",
    experience: 0,
    category: "",
    // Informations sur les armes
    weaponType: "",
    weaponBrand: "",
    customWeaponBrand: "", // Marque personnalisée pour l'option "Autre"
    weaponReference: "",
    weaponCaliber: "",
    weaponOtherDetails: ""
  });

  // Mise à jour des données du formulaire lorsque l'utilisateur et les données du chasseur changent
  useEffect(() => {
    if (user) {
      const hd = (hunterData || {}) as HunterProfileData;
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: (hd.phone || "") as string,
        address: (hd.address || "") as string,
        dateOfBirth: hd.dateOfBirth ? new Date(hd.dateOfBirth).toISOString().split('T')[0] : "",
        idNumber: (hd.idNumber || "") as string,
        nationality: (hd.nationality || hd.pays || "") as string,
        profession: (hd.profession || "") as string,
        // region: hd.region || "",
        experience: (hd.experience ?? 0) || 0,
        category: (hd.category || "") as string,
        // Informations sur les armes
        weaponType: (hd.weaponType || "") as string,
        weaponBrand: (hd.weaponBrand || "") as string,
        customWeaponBrand: (hd.customWeaponBrand || "") as string,
        weaponReference: (hd.weaponReference || "") as string,
        weaponCaliber: (hd.weaponCaliber || "") as string,
        weaponOtherDetails: (hd.weaponOtherDetails || "") as string
      });
    }
  }, [user, hunterData]);

  const [credentialsForm, setCredentialsForm] = useState({
    username: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [unlockUsername, setUnlockUsername] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState(false);

  useEffect(() => {
    if (user?.username) {
      setCredentialsForm(prev => ({ ...prev, username: user.username }));
    }
  }, [user?.username]);

  const updateCredentialsMutation = useMutation({
    mutationFn: (userData: any) =>
      apiRequest({
        url: `/api/users/${user?.id}`,
        method: 'PUT',
        data: userData
      }),
    onSuccess: () => {
      toast({
        title: "Identifiants mis à jour",
        description: "Données mises à jour avec succès.",
        variant: "default",
      });
      setCredentialsForm(prev => ({ ...prev, password: "", confirmPassword: "" }));
      setUnlockUsername(false);
      setUnlockPassword(false);
    },
    onError: (error: any) => {
      console.error('Erreur lors de la mise à jour des identifiants:', error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la mise à jour de vos identifiants.",
        variant: "destructive",
      });
    }
  });

  const updateHunterMutation = useMutation({
    mutationFn: (hunterData: any) =>
      apiRequest({
        url: `/api/hunters/${hunterId}/equipment`,
        method: 'PATCH',
        data: hunterData
      }),
    onSuccess: () => {
      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été enregistrées avec succès.",
        variant: "default",
      });
      setEditMode(false);
      // Invalider le cache pour recharger les données
      queryClient.invalidateQueries({ queryKey: ['/api/hunters/me'] });
    },
    onError: (error) => {
      console.error('Erreur lors de la mise à jour du profil:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la mise à jour de votre profil.",
        variant: "destructive",
      });
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    // Si on change le type d'arme vers arbalète, arc ou lance-pierre, on vide les champs marque, référence et calibre
    if (name === 'weaponType') {
      if (value === 'arbalete' || value === 'arc' || value === 'lance-pierre') {
        setFormData(prev => ({
          ...prev,
          [name]: value,
          weaponBrand: '',
          customWeaponBrand: '',
          weaponReference: '',
          weaponCaliber: ''
        }));
      } else {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const saveProfile = () => {
    const hunterUpdateData = {
      // Les informations personnelles ne peuvent pas être modifiées
      // Seules les informations d'équipement de chasse peuvent être modifiées
      weaponType: formData.weaponType,
      weaponBrand: formData.weaponBrand,
      customWeaponBrand: formData.customWeaponBrand,
      weaponReference: formData.weaponReference,
      weaponCaliber: formData.weaponCaliber,
      weaponOtherDetails: formData.weaponOtherDetails
    };

    updateHunterMutation.mutate(hunterUpdateData);
  };

  const weaponTypes = [
    { value: "fusil", label: "Fusil" },
    { value: "carabine", label: "Carabine" },
    { value: "arbalete", label: "Arbalète" },
    { value: "arc", label: "Arc" },
    { value: "lance-pierre", label: "Lance-pierre" },
    { value: "autre", label: "Autre" }
  ];

  // Liste des marques de fusils
  const fusils = [
    { value: "ARMED", label: "ARMED" },
    { value: "BAIKAL", label: "BAIKAL" },
    { value: "BERETTA", label: "BERETTA" },
    { value: "BROWNING", label: "BROWNING" },
    { value: "CROMATA", label: "CROMATA" },
    { value: "ESCORT", label: "ESCORT" },
    { value: "HUGLU", label: "HUGLU" },
    { value: "IDEAL", label: "IDEAL" },
    { value: "MANUFRANCE", label: "MANUFRANCE" },
    { value: "OPTIMA", label: "OPTIMA" },
    { value: "PRANDELLI", label: "PRANDELLI" },
    { value: "ROBUST", label: "ROBUST" },
    { value: "ROSSI", label: "ROSSI" },
    { value: "SKB", label: "SKB" },
    { value: "AUTRE", label: "Autre" }
  ];

  // Liste des marques de carabines
  const carabines = [
    { value: "BAIKAL", label: "BAIKAL" },
    { value: "BERETTA", label: "BERETTA" },
    { value: "BROWNING", label: "BROWNING" },
    { value: "MANUFRANCE", label: "MANUFRANCE" },
    { value: "ROSSI", label: "ROSSI" },
    { value: "TANFOGLIO", label: "TANFOGLIO" },
    { value: "WINCHESTER", label: "WINCHESTER" },
    { value: "WINCHESTER-70XTM", label: "WINCHESTER-70XTM" },
    { value: "AUTRE", label: "Autre" }
  ];

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // CSS en ligne pour les champs readonly
  const readOnlyStyle = {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
    cursor: "not-allowed",
    border: "1px solid #d1d5db",
    opacity: 0.8
  };

  return (
    <div className="space-y-4 p-4 md:p-8 pt-2 max-w-6xl mx-auto">
      <div className="space-y-6">

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Mon profil chasseur</CardTitle>
                <CardDescription>
                  Informations personnelles et coordonnées
                </CardDescription>
              </div>
              <div>
                {/* Les chasseurs ne peuvent pas modifier leurs informations personnelles */}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/4 flex flex-col items-center">
                  <div className="relative mb-4">
                    <Avatar className="h-32 w-32 border-2 border-slate-200 shadow-sm">
                      <AvatarImage src={avatarUrl} alt="Photo de profil" className="object-cover" />
                      <AvatarFallback className="text-4xl">
                        {user?.firstName?.charAt(0) || user?.lastName?.charAt(0) || "P"}
                      </AvatarFallback>
                    </Avatar>

                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => setPhotoMenuOpen((o) => !o)}
                      className="absolute bottom-1 right-1 h-9 w-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border-2 border-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-60"
                      title="Prendre ou importer une photo de profil"
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>

                    {photoMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setPhotoMenuOpen(false)} />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoMenuOpen(false);
                              setShowCameraModal(true);
                            }}
                            className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2.5 transition-colors"
                          >
                            <Camera className="h-4 w-4 text-emerald-600" />
                            <span>Prendre une photo</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoMenuOpen(false);
                              photoFileInputRef.current?.click();
                            }}
                            className="w-full text-left px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2.5 transition-colors"
                          >
                            <Upload className="h-4 w-4 text-emerald-600" />
                            <span>Choisir un fichier</span>
                          </button>
                        </div>
                      </>
                    )}

                    <input
                      ref={photoFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/jpg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadHunterPhoto(f);
                      }}
                    />

                    <CameraCaptureModal
                      open={showCameraModal}
                      onClose={() => setShowCameraModal(false)}
                      onCapture={(capturedFile) => handleUploadHunterPhoto(capturedFile)}
                    />
                  </div>
                  <div className="text-center">
                    <h3 className="font-medium text-lg">{user?.firstName} {user?.lastName}</h3>
                    <p className="text-sm text-muted-foreground">Chasseur</p>
                  </div>
                </div>

                <div className="md:w-3/4">
                  {editMode ? (
                    <div className="space-y-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="col-span-2 flex justify-between items-center pb-2 border-b mb-2">
                            <h3 className="font-medium">Informations personnelles</h3>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="firstName">Prénom</Label>
                            <Input
                              id="firstName"
                              name="firstName"
                              value={formData.firstName}
                              onChange={handleChange}
                              placeholder="Prénom"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="lastName">Nom</Label>
                            <Input
                              id="lastName"
                              name="lastName"
                              value={formData.lastName}
                              onChange={handleChange}
                              placeholder="Nom"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="dateOfBirth">Date de naissance</Label>
                            <Input
                              id="dateOfBirth"
                              name="dateOfBirth"
                              type="date"
                              value={formData.dateOfBirth}
                              onChange={handleChange}
                              disabled={true}
                            />
                            <p className="text-xs text-gray-500">La date de naissance ne peut pas être modifiée</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <h3 className="col-span-2 font-medium pb-2 border-b mb-2">Identité</h3>
                          <div className="space-y-2">
                            <Label htmlFor="idNumber">Numéro de carte d'identité</Label>
                            <Input
                              id="idNumber"
                              name="idNumber"
                              value={formData.idNumber}
                              onChange={handleChange}
                              placeholder="Numéro de CIN"
                              disabled={true}
                            />
                            <p className="text-xs text-gray-500">Le numéro d'identité ne peut pas être modifié</p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="nationality">Nationalité</Label>
                            <Input
                              id="nationality"
                              name="nationality"
                              value={formData.nationality}
                              onChange={handleChange}
                              placeholder="Nationalité"
                              disabled={true}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <h3 className="col-span-2 font-medium pb-2 border-b mb-2">Situation</h3>
                          <div className="space-y-2">
                            <Label htmlFor="category">Catégorie</Label>
                            <Select
                              value={formData.category}
                              onValueChange={(value) => handleSelectChange('category', value)}
                              disabled={true}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Sélectionner une catégorie" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="resident">Résident</SelectItem>
                                <SelectItem value="coutumier">Coutumier</SelectItem>
                                <SelectItem value="touristique">Touristique</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">La catégorie ne peut pas être modifiée</p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="profession">Profession</Label>
                            <Input
                              id="profession"
                              name="profession"
                              value={formData.profession}
                              onChange={handleChange}
                              placeholder="Profession"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="experience">Expérience (années)</Label>
                            <Input
                              id="experience"
                              name="experience"
                              type="number"
                              min="0"
                              value={formData.experience}
                              onChange={handleNumericChange}
                              placeholder="Années d'expérience"
                            />
                          </div>

                          <div className="space-y-2">

                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <h3 className="col-span-2 font-medium pb-2 border-b mb-2">Coordonnées</h3>
                          <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              name="email"
                              type="email"
                              value={formData.email}
                              onChange={handleChange}
                              placeholder="Email"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="phone">Téléphone</Label>
                            <Input
                              id="phone"
                              name="phone"
                              value={formData.phone}
                              onChange={handleChange}
                              placeholder="Téléphone"
                            />
                          </div>

                          <div className="col-span-2 space-y-2">
                            <Label htmlFor="address">Adresse</Label>
                            <Input
                              id="address"
                              name="address"
                              value={formData.address}
                              onChange={handleChange}
                              placeholder="Adresse"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <UserRound className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Nom et prénom</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.firstName} {formData.lastName}</p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <Calendar className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Date de naissance</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">
                              {formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString() : "Non renseigné"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <BadgeCheck className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Numéro CIN</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.idNumber}</p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <Target className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Catégorie</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">
                              {formData.category === "resident" ? "Résident" :
                                formData.category === "coutumier" ? "Coutumier" :
                                  formData.category === "touristique" ? "Touristique" :
                                    formData.category}
                            </p>
                          </div>
                        </div>

                        {formData.category === 'touristique' && (
                          <div className="flex items-center">
                            <BadgeCheck className="h-5 w-5 text-muted-foreground mr-2" />
                            <div className="space-y-0.5">
                              <p className="text-sm text-muted-foreground">Nationalité</p>
                              <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">
                                {formData.nationality || 'Non renseignée'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center">
                          <Mail className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <Phone className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Téléphone</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <MapPin className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Adresse</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.address}</p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <Briefcase className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Profession</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.profession || "Non renseigné"}</p>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <Clock className="h-5 w-5 text-muted-foreground mr-2" />
                          <div className="space-y-0.5">
                            <p className="text-sm text-muted-foreground">Expérience</p>
                            <p className="font-medium text-gray-500 bg-gray-100 py-1 px-2 rounded">{formData.experience} an{formData.experience > 1 ? "s" : ""}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres de connexion</CardTitle>
              <CardDescription>
                Modifiez votre nom d'utilisateur (Identifiant) et votre mot de passe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div className="space-y-2">
                  <Label className="flex items-center">
                    Nom d'utilisateur (Identifiant)
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 h-6 w-6 p-0" 
                      onClick={() => setUnlockUsername(!unlockUsername)}
                    >
                      <Pencil className={`h-3 w-3 ${unlockUsername ? 'text-green-600' : 'text-gray-400'}`} />
                    </Button>
                  </Label>
                  <Input
                    value={credentialsForm.username}
                    onChange={e => setCredentialsForm(prev => ({ ...prev, username: e.target.value }))}
                    disabled={!unlockUsername}
                    className={unlockUsername ? 'border-green-400' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center">
                    Nouveau mot de passe
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 h-6 w-6 p-0" 
                      onClick={() => {
                        setUnlockPassword(!unlockPassword);
                        if (unlockPassword) {
                          setCredentialsForm(prev => ({ ...prev, password: "", confirmPassword: "" }));
                        }
                      }}
                    >
                      <Pencil className={`h-3 w-3 ${unlockPassword ? 'text-green-600' : 'text-gray-400'}`} />
                    </Button>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Laissez vide pour ne pas modifier"
                      value={credentialsForm.password}
                      onChange={e => setCredentialsForm(prev => ({ ...prev, password: e.target.value }))}
                      disabled={!unlockPassword}
                      className={`pr-10 ${unlockPassword ? 'border-green-400' : ''}`}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {credentialsForm.password.length > 0 && (
                  <div className="space-y-2">
                    <Label>Confirmer le mot de passe</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Répétez le nouveau mot de passe"
                        value={credentialsForm.confirmPassword}
                        onChange={e => setCredentialsForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className={`pr-10 ${credentialsForm.confirmPassword && credentialsForm.password !== credentialsForm.confirmPassword ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                    </div>
                    {credentialsForm.confirmPassword && credentialsForm.password !== credentialsForm.confirmPassword && (
                      <p className="text-xs text-red-500">Les mots de passe ne correspondent pas.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end max-w-2xl">
                <Button
                  onClick={() => {
                    if (credentialsForm.username.trim() === "") {
                      toast({
                        title: "Erreur",
                        description: "Le nom d'utilisateur ne peut pas être vide.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (unlockPassword && credentialsForm.password.trim() === "") {
                      toast({
                        title: "Erreur",
                        description: "Le mot de passe ne peut pas être vide si vous souhaitez le modifier.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (credentialsForm.password && credentialsForm.password !== credentialsForm.confirmPassword) {
                      toast({
                        title: "Erreur",
                        description: "Les mots de passe ne correspondent pas.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const payload: any = { username: credentialsForm.username };
                    if (unlockPassword && credentialsForm.password) payload.password = credentialsForm.password;
                    updateCredentialsMutation.mutate(payload);
                  }}
                  disabled={
                    updateCredentialsMutation.isPending || 
                    (!unlockUsername && !unlockPassword) || 
                    credentialsForm.username.trim() === "" ||
                    (unlockPassword && credentialsForm.password.trim() === "") ||
                    (unlockPassword && credentialsForm.password !== credentialsForm.confirmPassword)
                  }
                >
                  {updateCredentialsMutation.isPending ? "Enregistrement..." : "Mettre à jour les identifiants"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-gray-100 pb-10 flex flex-col items-center">
        <p className="mt-4 text-[10px] text-gray-400">Version 1.0.0</p>
      </div>
    </div>
  );
}
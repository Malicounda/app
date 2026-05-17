import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Save, Edit, Check, X, Briefcase, Target, LogOut,
  UserRound, Calendar, BadgeCheck, Mail, Phone, MapPin, Clock
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiRequestBlob } from "@/lib/api";
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
      } catch (err: any) {
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

  // Charger la photo du chasseur de manière authentifiée et générer un blob URL
  useEffect(() => {
    let prevUrl: string | null = null;
    const hasPhoto = attachmentsStatus?.items?.some(i => i.type === 'hunterPhoto' && i.present);
    if (hunterId && hasPhoto) {
      (async () => {
        try {
          const res = await apiRequestBlob(`/attachments/${hunterId}/hunterPhoto?inline=1`, 'GET');
          if (res.ok && res.blob) {
            const url = URL.createObjectURL(res.blob);
            prevUrl = url;
            setAvatarUrl(url);
          } else {
            setAvatarUrl("");
          }
        } catch (_) {
          setAvatarUrl("");
        }
      })();
    } else {
      setAvatarUrl("");
    }
    return () => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [hunterId, attachmentsStatus?.updatedAt]);

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
    <div className="space-y-6 p-4 md:p-8 pt-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-3xl font-bold tracking-tight">
          Mon Profil
        </h2>
      </div>

      <div className="border-b border-gray-200"></div>

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
                  <Avatar className="h-32 w-32 mb-4">
                    <AvatarImage src={avatarUrl} alt="Photo de profil" />
                    <AvatarFallback className="text-4xl">
                      {user?.firstName?.charAt(0) || user?.lastName?.charAt(0) || "P"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <h3 className="font-medium text-lg">{user?.firstName} {user?.lastName}</h3>
                    <p className="text-sm text-muted-foreground">Chasseur</p>
                    {editMode && (
                      <Button variant="outline" size="sm" className="mt-2">
                        Changer la photo
                      </Button>
                    )}
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
      </div>
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
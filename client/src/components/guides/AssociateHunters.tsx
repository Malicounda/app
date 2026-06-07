import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - QR Scanner library types
import QrScanner from 'qr-scanner';
import { 
    Search, 
    QrCode, 
    Camera, 
    UserPlus, 
    Loader2, 
    CheckCircle, 
    XCircle,
    Users,
    Phone,
    MapPin,
    Globe,
    Calendar,
    FileText,
    CreditCard,
    Tag
} from 'lucide-react';

interface Hunter {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    idNumber: string;
    permitNumber?: string;
    permitCategory?: string;
    nationality?: string;
    departement?: string;
    createdAt?: string;
    photo?: string;
}

interface AssociateHuntersProps {
    guideId: string;
    onAssociationComplete?: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
}

export default function AssociateHunters({ guideId, onAssociationComplete, open, onOpenChange, trigger }: AssociateHuntersProps) {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = open !== undefined ? open : internalIsOpen;
    const setIsOpen = onOpenChange || setInternalIsOpen;
    
    const [activeTab, setActiveTab] = useState('qr');
    const [showErrorDialog, setShowErrorDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorTitle, setErrorTitle] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Hunter[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedHunter, setSelectedHunter] = useState<Hunter | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const qrScannerRef = useRef<QrScanner | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Mutation pour associer un chasseur
    const associateMutation = useMutation({
        mutationFn: (hunterId: string) => apiRequest({
            url: `/api/guides/${guideId}/associate-hunter`,
            method: 'POST',
            data: { hunterId }
        }),
        onSuccess: () => {
            toast({
                title: "Chasseur associé avec succès",
                description: "Le chasseur a été associé avec succès à votre profil de guide.",
            });
            setIsOpen(false);
            setSelectedHunter(null);
            setSearchQuery('');
            setSearchResults([]);
            onAssociationComplete?.();
            queryClient.invalidateQueries({ queryKey: ["/api/guides", guideId, "hunters"] });
        },
        onError: (error: any) => {
            let errorMessage = "Une erreur est survenue lors de l'association du chasseur.";
            let errorTitle = "Erreur d'association";
            
            // Vérifier si c'est une erreur de chasseur déjà associé
            if (error.message) {
                if (error.message.includes("déjà associé par vous")) {
                    errorTitle = "Chasseur déjà associé";
                    errorMessage = "Ce chasseur est déjà associé par vous.";
                    
                    // Afficher une boîte de dialogue claire au lieu d'un simple toast
                    setErrorTitle(errorTitle);
                    setErrorMessage(errorMessage);
                    setShowErrorDialog(true);
                    return;
                }
                
                if (error.message.includes("déjà associé par le guide")) {
                    errorTitle = "Chasseur déjà associé";
                    errorMessage = error.message; // Utiliser directement le message du backend qui contient le nom du guide
                    
                    // Afficher une boîte de dialogue claire au lieu d'un simple toast
                    setErrorTitle(errorTitle);
                    setErrorMessage(errorMessage);
                    setShowErrorDialog(true);
                    return;
                } else {
                    errorMessage = error.message;
                }
            }
            
            // Pour les autres erreurs, utiliser le toast normal
            toast({
                title: errorTitle,
                description: errorMessage,
                variant: "destructive",
            });
        }
    });

    // Recherche unifiée par numéro d'identité ou numéro de permis
    const searchHunters = async () => {
        if (!searchQuery.trim()) {
            toast({
                title: "Recherche vide",
                description: "Veuillez saisir un numéro d'identité ou de permis pour rechercher.",
                variant: "destructive",
            });
            return;
        }

        setIsSearching(true);
        try {
            // D'abord essayer la recherche par numéro d'identité
            let response = await apiRequest<Hunter[]>({
                url: `/api/hunters/search?idNumber=${encodeURIComponent(searchQuery.trim())}`,
                method: 'GET'
            });

            // Si aucun résultat par numéro d'identité, essayer par numéro de permis
            if (!response || response.length === 0) {
                try {
                    const permitResponse = await apiRequest<any>({
                        url: `/api/permits/search?permitNumber=${encodeURIComponent(searchQuery.trim())}`,
                        method: 'GET'
                    });
                    
                    if (permitResponse && permitResponse.hunter) {
                        response = [permitResponse.hunter];
                    }
                } catch (permitError) {
                    // Ignorer l'erreur de recherche par permis si la recherche par ID a déjà échoué
                    console.debug('Recherche par permis échouée:', permitError);
                }
            }

            setSearchResults(response || []);
            
            if (!response || response.length === 0) {
                toast({
                    title: "Aucun résultat",
                    description: "Aucun chasseur trouvé avec ce numéro d'identité ou de permis.",
                    variant: "destructive",
                });
            }
        } catch (error: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
            toast({
                title: "Erreur de recherche",
                description: error.message || "Une erreur est survenue lors de la recherche.",
                variant: "destructive",
             });
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Démarrer la caméra pour le scan QR
    const startCamera = async () => {
        try {
            setIsScanning(true);
            
            if (videoRef.current) {
                // Créer une instance QrScanner
                const qrScanner = new QrScanner(
                    videoRef.current,
                    (result: any) => {
                        // QR code détecté avec succès
                        console.log('QR Scanner result:', result);
                        const qrData = result.data || result;
                        console.log('QR Data extracted:', qrData);
                        handleQRScanResult(qrData);
                    },
                    {
                        onDecodeError: (error: any) => {
                            // Ignorer les erreurs de décodage (normales pendant le scan)
                            console.debug('QR decode error:', error);
                        },
                        highlightScanRegion: true,
                        highlightCodeOutline: true,
                        preferredCamera: 'environment',
                        maxScansPerSecond: 25,
                        returnDetailedScanResult: true,
                        calculateScanRegion: (video: HTMLVideoElement) => {
                            // Scanner toute la zone vidéo pour une détection plus rapide
                            return {
                                x: 0,
                                y: 0,
                                width: video.videoWidth,
                                height: video.videoHeight,
                                downScaledWidth: video.videoWidth,
                                downScaledHeight: video.videoHeight
                            };
                        }
                    }
                );

                qrScannerRef.current = qrScanner;
                await qrScanner.start();
            }
        } catch (error) {
            console.error('Erreur d\'accès à la caméra:', error);
            toast({
                title: "Erreur caméra",
                description: "Impossible d'accéder à la caméra. Vérifiez les permissions.",
                variant: "destructive",
            });
            setIsScanning(false);
        }
    };

    // Arrêter la caméra
    const stopCamera = () => {
        if (qrScannerRef.current) {
            qrScannerRef.current.stop();
            qrScannerRef.current.destroy();
            qrScannerRef.current = null;
        }
        setIsScanning(false);
    };

    // Gérer le résultat du scan QR
    const handleQRScanResult = (qrData: any) => {
        stopCamera();
        
        console.log('QR Code scanné:', qrData); // Debug
        
        let hunterId = '';
        
        try {
            // Essayer de parser comme JSON si c'est un objet
            const parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
            if (parsed && typeof parsed === 'object') {
                if (parsed.hunterId) {
                    hunterId = String(parsed.hunterId);
                } else if (parsed.id) {
                    hunterId = String(parsed.id);
                } else if (parsed.userId) {
                    hunterId = String(parsed.userId);
                } else {
                    hunterId = extractHunterIdFromText(typeof qrData === 'string' ? qrData : String(qrData || ''));
                }
            } else {
                hunterId = extractHunterIdFromText(String(qrData || ''));
            }
        } catch (e) {
            if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
            // Si ce n'est pas du JSON, extraire le numéro de pièce d'identité du texte
            hunterId = extractHunterIdFromText(typeof qrData === 'string' ? qrData : String(qrData || ''));
        }
        
        console.log('Hunter ID extrait:', hunterId);
        
        if (hunterId && hunterId.trim() && hunterId !== '[object Object]') {
            toast({
                title: "QR Code détecté",
                description: `Recherche du chasseur: ${hunterId}`,
            });
            searchHunterById(hunterId.trim());
        } else {
            toast({
                title: "QR Code invalide",
                description: "Le QR code scanné ne contient pas d'informations valides.",
                variant: "destructive",
            });
        }
    };

    // Extraire l'ID du chasseur depuis le texte du QR code
    const extractHunterIdFromText = (text: string | any): string => {
        const safeText = typeof text === 'string' ? text : String(text || '');
        console.log('Extraction ID depuis texte:', safeText);
        
        // Chercher le numéro de pièce d'identité
        const pieceIdMatch = safeText.match(/N° Pièce d'identité:\s*(\d+)/);
        if (pieceIdMatch && pieceIdMatch[1]) {
            console.log('ID trouvé (N° Pièce):', pieceIdMatch[1]);
            return pieceIdMatch[1];
        }
        
        // Chercher le numéro de permis
        const permitMatch = safeText.match(/Numéro de Permis:\s*([^\n]+)/);
        if (permitMatch && permitMatch[1]) {
            console.log('ID trouvé (Numéro de Permis):', permitMatch[1]);
            return permitMatch[1].trim();
        }
        
        // Chercher un numéro de permis alternatif
        const permitMatch2 = safeText.match(/P-[A-Z]{2}-\d{4}-[A-Z0-9]+/);
        if (permitMatch2 && permitMatch2[0]) {
            console.log('ID trouvé (Format Permis):', permitMatch2[0]);
            return permitMatch2[0];
        }
        
        // Chercher un numéro d'identité simple (séquence de chiffres)
        const idMatch = safeText.match(/\b\d{10,}\b/);
        if (idMatch && idMatch[0]) {
            console.log('ID trouvé (Numéro long):', idMatch[0]);
            return idMatch[0];
        }
        
        console.log('Aucun ID trouvé dans le texte');
        return safeText.trim(); // Fallback sur le texte original
    };


    // Rechercher un chasseur par ID (depuis QR code)
    const searchHunterById = async (hunterId: string) => {
        setIsSearching(true);
        try {
            console.log('Recherche du chasseur avec ID:', hunterId);
            
            // Utiliser l'endpoint de recherche par numéro d'identité
            const response = await apiRequest<Hunter[]>({
                url: `/api/hunters/search?idNumber=${encodeURIComponent(hunterId)}`,
                method: 'GET'
            });
            
            console.log('Résultats de recherche:', response);
            
            if (response && response.length > 0) {
                // Prendre le premier résultat
                const hunter = response[0];
                setSelectedHunter(hunter);
                toast({
                    title: "Chasseur trouvé",
                    description: `${hunter.firstName} ${hunter.lastName} a été trouvé avec succès.`
                });
            } else {
                throw new Error('Aucun chasseur trouvé avec ce numéro d\'identité');
            }
        } catch (error: any) {
            console.error('Erreur lors de la recherche du chasseur:', error);
            toast({
                title: "Chasseur non trouvé",
                description: error.message || "Aucun chasseur trouvé avec cet ID.",
                variant: "destructive",
            });
        } finally {
            setIsSearching(false);
        }
    };

    // Nettoyer les ressources à la fermeture
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    const handleAssociate = (hunter: Hunter) => {
        setSelectedHunter(hunter);
    };

    const confirmAssociation = () => {
        if (!guideId) {
            toast({
                title: "Guide manquant",
                description: "Impossible d'associer sans identifiant de guide valide.",
                variant: "destructive",
            });
            return;
        }
        if (selectedHunter) {
            associateMutation.mutate(selectedHunter.id);
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                {trigger ? (
                    <DialogTrigger asChild>
                        {trigger}
                    </DialogTrigger>
                ) : (
                    <DialogTrigger asChild>
                        <Button size="sm" className="bg-black hover:bg-gray-800 text-white" disabled={!guideId}>
                            <Users className="h-4 w-4 mr-2" />
                            Associer des chasseurs
                        </Button>
                    </DialogTrigger>
                )}
                <DialogContent className="max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden bg-white shadow-2xl border-2 border-emerald-500/80 ring-4 ring-emerald-500/20">
                    <div className="bg-emerald-50/50 px-6 py-5 border-b border-emerald-100/50">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-800">
                                <UserPlus className="h-5 w-5 text-emerald-600" />
                                Associer des Chasseurs
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 text-sm mt-1.5">
                                Recherchez un chasseur par numéro de pièce, numéro de permis ou scannez son QR code pour l'associer.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="p-6 pt-4">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100/80 p-1 rounded-xl">
                                <TabsTrigger value="qr" className="flex items-center justify-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 transition-all">
                                    <QrCode className="h-4 w-4" />
                                    Scan QR Code
                                </TabsTrigger>
                                <TabsTrigger value="manual" className="flex items-center justify-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 transition-all">
                                    <Search className="h-4 w-4" />
                                    Recherche manuelle
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="manual" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
                                <div className="space-y-1.5">
                                    <h3 className="font-semibold text-slate-800">Rechercher par numéro de pièce ou permis</h3>
                                    <p className="text-sm text-slate-500">
                                        Saisissez le numéro de pièce d'identité ou le numéro de permis du chasseur que vous souhaitez associer
                                    </p>
                                </div>
                                
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="search" className="text-xs font-medium text-slate-600 uppercase tracking-wider">Numéro de pièce ou permis</Label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                    <CreditCard className="h-4 w-4 text-slate-400" />
                                                </div>
                                                <Input
                                                    id="search"
                                                    placeholder="Ex: 1234567890123 ou PER-2024-001234"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onKeyPress={(e) => e.key === 'Enter' && searchHunters()}
                                                    className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
                                                />
                                            </div>
                                            <Button 
                                                onClick={searchHunters}
                                                disabled={isSearching}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors px-4"
                                            >
                                                {isSearching ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Search className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Résultats de recherche */}
                                    {searchResults.length > 0 && (
                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <h4 className="font-medium text-slate-800 text-sm flex items-center gap-2">
                                                <Users className="h-4 w-4 text-emerald-600" />
                                                Résultats ({searchResults.length})
                                            </h4>
                                            <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                                {searchResults.map((hunter) => (
                                                    <div key={hunter.id} className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-emerald-200 hover:shadow-md transition-all group flex flex-col gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-10 w-10 ring-2 ring-emerald-50">
                                                                <AvatarImage src={hunter.photo} />
                                                                <AvatarFallback className="bg-emerald-100 text-emerald-700 font-bold">
                                                                    {hunter.firstName.charAt(0)}{hunter.lastName.charAt(0)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex-1 min-w-0">
                                                                <h5 className="font-semibold text-slate-800 truncate">
                                                                    {hunter.firstName} {hunter.lastName}
                                                                </h5>
                                                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-medium px-1.5 py-0">
                                                                        {hunter.idNumber}
                                                                    </Badge>
                                                                    {hunter.nationality && (
                                                                        <span className="truncate">{hunter.nationality}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                                {hunter.permitNumber ? (
                                                                    <>
                                                                        <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                                                                        <span className="font-medium">{hunter.permitNumber}</span>
                                                                    </>
                                                                ) : (
                                                                    <span className="italic">Aucun permis</span>
                                                                )}
                                                            </div>
                                                            <Button 
                                                                size="sm"
                                                                onClick={() => handleAssociate(hunter)}
                                                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm h-8 rounded-lg"
                                                            >
                                                                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                                                Sélectionner
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TabsContent>


                            <TabsContent value="qr" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
                                <div className="space-y-1.5">
                                    <h3 className="font-semibold text-slate-800">Scanner un QR Code</h3>
                                    <p className="text-sm text-slate-500">
                                        Utilisez la caméra de votre appareil pour scanner rapidement le QR code du chasseur
                                    </p>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div className="relative w-full mx-auto overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                        <video
                                            ref={videoRef}
                                            className="w-full h-auto bg-black"
                                            style={{ 
                                                display: isScanning ? 'block' : 'none',
                                                minHeight: '250px',
                                                maxHeight: '400px',
                                                objectFit: 'cover'
                                            }}
                                            playsInline
                                            muted
                                        />
                                        {isScanning && (
                                            <div className="absolute inset-0 pointer-events-none">
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-64 sm:h-64 border-2 border-emerald-400/50 rounded-lg">
                                                    <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-emerald-400 rounded-tl-lg -ml-1 -mt-1"></div>
                                                    <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-emerald-400 rounded-tr-lg -mr-1 -mt-1"></div>
                                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-emerald-400 rounded-bl-lg -ml-1 -mb-1"></div>
                                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-emerald-400 rounded-br-lg -mr-1 -mb-1"></div>
                                                </div>
                                            </div>
                                        )}
                                        {!isScanning && (
                                            <div className="w-full aspect-video flex flex-col items-center justify-center gap-4 p-8">
                                                <div className="h-16 w-16 rounded-full bg-slate-200/50 flex items-center justify-center">
                                                    <QrCode className="h-8 w-8 text-slate-400" />
                                                </div>
                                                <p className="text-sm text-slate-500 text-center max-w-[200px]">
                                                    Positionnez le QR code dans le cadre une fois la caméra activée
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex justify-center pt-2">
                                        {!isScanning ? (
                                            <Button onClick={startCamera} className="bg-slate-800 hover:bg-slate-900 text-white rounded-full px-6 shadow-md transition-transform active:scale-95">
                                                <Camera className="h-4 w-4 mr-2" />
                                                Activer la caméra
                                            </Button>
                                        ) : (
                                            <Button onClick={stopCamera} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full px-6 transition-colors">
                                                Arrêter le scan
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>

                    {/* Confirmation d'association */}
                    {selectedHunter && (
                        <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
                            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-emerald-100 overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
                                <div className="bg-emerald-50 px-5 py-4 border-b border-emerald-100 flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                                    <h3 className="font-bold text-emerald-800">Confirmer l'association</h3>
                                </div>
                                <div className="p-5">
                                    <div className="flex items-center gap-4 mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <Avatar className="h-14 w-14 ring-2 ring-white shadow-sm">
                                            <AvatarImage src={selectedHunter.photo} />
                                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg font-bold">
                                                {selectedHunter.firstName.charAt(0)}{selectedHunter.lastName.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-slate-800 text-lg truncate">
                                                {selectedHunter.firstName} {selectedHunter.lastName}
                                            </h4>
                                            <p className="text-sm text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                                <CreditCard className="h-3.5 w-3.5" />
                                                {selectedHunter.idNumber}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <Button 
                                            variant="outline" 
                                            onClick={() => setSelectedHunter(null)}
                                            className="flex-1 rounded-xl h-11 border-slate-200 text-slate-600 hover:bg-slate-50"
                                        >
                                            Annuler
                                        </Button>
                                        <Button 
                                            onClick={confirmAssociation}
                                            disabled={associateMutation.isPending}
                                            className="flex-1 rounded-xl h-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                                        >
                                            {associateMutation.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                "Confirmer"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Boîte de dialogue d'erreur pour les associations existantes */}
            <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <XCircle className="h-5 w-5" />
                            {errorTitle}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-800 font-medium">{errorMessage}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-900 mb-2">Information importante :</h4>
                            <ul className="text-blue-800 text-sm space-y-1">
                                <li>• Un chasseur ne peut être associé qu'à un seul guide à la fois</li>
                                <li>• Si le chasseur était précédemment associé, vous devez d'abord le dissocier</li>
                                <li>• Contactez l'administrateur si vous avez besoin d'aide</li>
                            </ul>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowErrorDialog(false)}>
                                Fermer
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

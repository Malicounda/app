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
}

export default function AssociateHunters({ guideId, onAssociationComplete }: AssociateHuntersProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('manual');
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
        } catch (error: any) {
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
    const handleQRScanResult = (qrData: string) => {
        stopCamera();
        
        console.log('QR Code scanné:', qrData); // Debug
        
        // Le QR code peut contenir différents formats
        let hunterId = qrData;
        
        try {
            // Essayer de parser comme JSON si c'est un objet
            const parsed = JSON.parse(qrData);
            if (parsed.hunterId) {
                hunterId = parsed.hunterId;
            } else if (parsed.id) {
                hunterId = parsed.id;
            } else if (parsed.userId) {
                hunterId = parsed.userId;
            }
        } catch (e) {
            // Si ce n'est pas du JSON, extraire le numéro de pièce d'identité du texte
            hunterId = extractHunterIdFromText(qrData);
        }
        
        console.log('Hunter ID extrait:', hunterId);
        
        if (hunterId && hunterId.trim()) {
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
    const extractHunterIdFromText = (text: string): string => {
        console.log('Extraction ID depuis texte:', text);
        
        // Chercher le numéro de pièce d'identité
        const pieceIdMatch = text.match(/N° Pièce d'identité:\s*(\d+)/);
        if (pieceIdMatch && pieceIdMatch[1]) {
            console.log('ID trouvé (N° Pièce):', pieceIdMatch[1]);
            return pieceIdMatch[1];
        }
        
        // Chercher le numéro de permis
        const permitMatch = text.match(/Numéro de Permis:\s*([^\n]+)/);
        if (permitMatch && permitMatch[1]) {
            console.log('ID trouvé (Numéro de Permis):', permitMatch[1]);
            return permitMatch[1].trim();
        }
        
        // Chercher un numéro de permis alternatif
        const permitMatch2 = text.match(/P-[A-Z]{2}-\d{4}-[A-Z0-9]+/);
        if (permitMatch2 && permitMatch2[0]) {
            console.log('ID trouvé (Format Permis):', permitMatch2[0]);
            return permitMatch2[0];
        }
        
        // Chercher un numéro d'identité simple (séquence de chiffres)
        const idMatch = text.match(/\b\d{10,}\b/);
        if (idMatch && idMatch[0]) {
            console.log('ID trouvé (Numéro long):', idMatch[0]);
            return idMatch[0];
        }
        
        console.log('Aucun ID trouvé dans le texte');
        return text.trim(); // Fallback sur le texte original
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
                <DialogTrigger asChild>
                    <Button size="sm" className="bg-black hover:bg-gray-800 text-white" disabled={!guideId}>
                        <Users className="h-4 w-4 mr-2" />
                        Associer des chasseurs
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Associer des Chasseurs
                        </DialogTitle>
                        <DialogDescription>
                            Recherchez un chasseur par numéro de pièce, numéro de permis ou scannez son QR code pour l'associer.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="manual" className="flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                Recherche manuelle
                            </TabsTrigger>
                            <TabsTrigger value="qr" className="flex items-center gap-2">
                                <QrCode className="h-4 w-4" />
                                Scan QR Code
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="manual" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Rechercher par numéro de pièce ou permis</CardTitle>
                                    <CardDescription>
                                        Saisissez le numéro de pièce d'identité ou le numéro de permis du chasseur que vous souhaitez associer
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label htmlFor="search">Numéro de pièce ou permis</Label>
                                            <Input
                                                id="search"
                                                placeholder="Ex: 1234567890123 ou PER-2024-001234"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyPress={(e) => e.key === 'Enter' && searchHunters()}
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button 
                                                onClick={searchHunters}
                                                disabled={isSearching}
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
                                        <div className="space-y-2">
                                            <h4 className="font-medium">Résultats de recherche:</h4>
                                            {searchResults.map((hunter) => (
                                                <Card key={hunter.id} className="p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar>
                                                                <AvatarImage src={hunter.photo} />
                                                                <AvatarFallback>
                                                                    {hunter.firstName.charAt(0)}{hunter.lastName.charAt(0)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <h5 className="font-medium">
                                                                    {hunter.firstName} {hunter.lastName}
                                                                </h5>
                                                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                                                    <span className="flex items-center gap-1">
                                                                        <Badge variant="outline">{hunter.idNumber}</Badge>
                                                                    </span>
                                                                    {hunter.permitNumber && (
                                                                        <span className="flex items-center gap-1">
                                                                            <CreditCard className="h-3 w-3" />
                                                                            {hunter.permitNumber}
                                                                        </span>
                                                                    )}
                                                                    {hunter.permitCategory && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Tag className="h-3 w-3" />
                                                                            {hunter.permitCategory}
                                                                        </span>
                                                                    )}
                                                                    {hunter.nationality && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Globe className="h-3 w-3" />
                                                                            {hunter.nationality}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button 
                                                            size="sm"
                                                            onClick={() => handleAssociate(hunter)}
                                                        >
                                                            Sélectionner
                                                        </Button>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>


                        <TabsContent value="qr" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Scanner un QR Code</CardTitle>
                                    <CardDescription>
                                        Utilisez la caméra pour scanner le QR code du chasseur
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="relative w-full mx-auto overflow-hidden rounded-lg">
                                        <video
                                            ref={videoRef}
                                            className="w-full h-auto bg-black rounded-lg"
                                            style={{ 
                                                display: isScanning ? 'block' : 'none',
                                                minHeight: '300px',
                                                maxHeight: '500px',
                                                objectFit: 'cover'
                                            }}
                                            playsInline
                                            muted
                                        />
                                        {isScanning && (
                                            <div className="absolute inset-0 pointer-events-none">
                                                <div className="absolute top-4 left-4 w-12 h-12 border-l-4 border-t-4 border-yellow-400 rounded-tl-lg"></div>
                                                <div className="absolute top-4 right-4 w-12 h-12 border-r-4 border-t-4 border-yellow-400 rounded-tr-lg"></div>
                                                <div className="absolute bottom-4 left-4 w-12 h-12 border-l-4 border-b-4 border-yellow-400 rounded-bl-lg"></div>
                                                <div className="absolute bottom-4 right-4 w-12 h-12 border-r-4 border-b-4 border-yellow-400 rounded-br-lg"></div>
                                            </div>
                                        )}
                                        {!isScanning && (
                                            <div className="w-full aspect-video border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-4">
                                                <QrCode className="h-16 w-16 text-gray-400" />
                                                <p className="text-sm text-muted-foreground text-center">
                                                    Positionnez le QR code dans le cadre
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex flex-col gap-2">
                                        <div className="flex gap-2 justify-center">
                                            {!isScanning ? (
                                                <Button onClick={startCamera} className="bg-black hover:bg-gray-800 text-white">
                                                    <Camera className="h-4 w-4 mr-2" />
                                                    Démarrer la caméra
                                                </Button>
                                            ) : (
                                                <Button onClick={stopCamera} variant="outline">
                                                    Arrêter
                                                </Button>
                                            )}
                                        </div>
                                        
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>

                    {/* Confirmation d'association */}
                    {selectedHunter && (
                        <Card className="border-green-200 bg-green-50">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-green-800">
                                    <CheckCircle className="h-5 w-5" />
                                    Confirmer l'association
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 mb-4">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={selectedHunter.photo} />
                                        <AvatarFallback>
                                            {selectedHunter.firstName.charAt(0)}{selectedHunter.lastName.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h4 className="font-medium">
                                            {selectedHunter.firstName} {selectedHunter.lastName}
                                        </h4>
                                        <div className="flex items-center gap-4 text-sm text-gray-600">
                                            <Badge variant="outline">{selectedHunter.idNumber}</Badge>
                                            {selectedHunter.permitNumber && (
                                                <span className="flex items-center gap-1">
                                                    <CreditCard className="h-3 w-3" />
                                                    {selectedHunter.permitNumber}
                                                </span>
                                            )}
                                            {selectedHunter.permitCategory && (
                                                <span className="flex items-center gap-1">
                                                    <Tag className="h-3 w-3" />
                                                    {selectedHunter.permitCategory}
                                                </span>
                                            )}
                                            {selectedHunter.nationality && (
                                                <span className="flex items-center gap-1">
                                                    <Globe className="h-3 w-3" />
                                                    {selectedHunter.nationality}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => setSelectedHunter(null)}
                                    >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Annuler
                                    </Button>
                                    <Button 
                                        onClick={confirmAssociation}
                                        disabled={associateMutation.isPending}
                                    >
                                        {associateMutation.isPending ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Association...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                                Confirmer l'association
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
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

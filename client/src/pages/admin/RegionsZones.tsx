import LocationSelector from "@/components/forms/LocationSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { BarChart3, Check, Edit, Eye, FileSpreadsheet, FileText, Lightbulb, MapPin, Plus, Search, Trash2, Upload, Users, X } from "lucide-react";
import proj4 from 'proj4';
import { useEffect, useMemo, useState } from "react";


export default function RegionsZones() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("hunting-zones");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const PERSIST_KEY = 'regionsZones.toggles';
  const [initializedFromStorage, setInitializedFromStorage] = useState(false);
  const [pendingMapType, setPendingMapType] = useState<string | null>(null);

  // Désactiver les logs console.info/log/warn pendant la durée de vie de cette page
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    // Garder console.error pour les erreurs critiques
    console.log = () => {};
    console.warn = () => {};
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
    };
  }, []);



  // États pour les paramètres dynamiques
  type ZoneTypeConfig = {
    id: number;
    key: string;
    label: string;
    color: string;
    isActive: boolean;
  };

  // Fonction pour trouver le département contenant un point donné (via API)
  const findDepartementFromPoint = async (lat: number, lon: number): Promise<string | null> => {
    try {
      console.log(`[Frontend] Appel API detect-departement avec lat=${lat}, lon=${lon}`);
      const response = await apiRequest<any>('GET', `/api/departements/detect-from-point?latitude=${lat}&longitude=${lon}`);
      const data = response?.data;
      if (data?.success && (data?.departement?.nom || data?.departement?.name)) {
        const name = String(data.departement.nom ?? data.departement.name);
        console.log('✅ Département détecté:', name);
        return name;
      } else {
        console.warn('⚠️ Aucun département trouvé pour le point:', { lat, lon, response });
        return null;
      }
    } catch (error) {
      console.error('Erreur détection département:', error);
      return null;
    }
  };

  type ZoneStatusConfig = {
    id: number;
    key: string;
    label: string;
    isActive: boolean;
  };

  type ZoneItem = {
    id: number;
    name: string;
    type: string;
    status?: string | null;
    color?: string | null;
    responsible_name?: string | null;
    responsible_phone?: string | null;
    responsible_email?: string | null;
    responsible_photo?: string | null;
    attachments?: { name?: string; url: string; mime?: string }[] | null;
    notes?: string | null;
    guides_count?: number | null;
    trackers_count?: number | null;
    region?: string | null;
    departement?: string | null;
    commune?: string | null;
    arrondissement?: string | null;
    area_sq_km?: number | null;
    surface_ha?: number | null;
    perimetre_m?: number | null;
    centroid_lat?: number | null;
    centroid_lon?: number | null;
    created_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    // Propriétés pour le style sur la carte
    isInactive?: boolean;
    mapColor?: string;
    mapOpacity?: number;
    showCrossPattern?: boolean;
    crossPatternColor?: string;
  };


  // Gestionnaire de fichiers déposés
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
      setDragActive(false);
    }
  };

  const clearUploadedCoords = () => {
    setCoordsFilePreview(null);
    setForm(prev => ({ ...prev, coordinates: [] }));
    // Déverrouiller lorsque l'utilisateur retire les données importées
    setCoordinateSystemLocked(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const deleteExistingAttachment = async (attachmentUrl: string) => {
    // Récupérer l'ID de la zone depuis l'URL de la pièce jointe
    // Format d'URL attendu: /uploads/documents/{filename}
    // On doit extraire l'ID de zone depuis le state ou le passer en paramètre

    // Pour l'instant, on va chercher la zone qui contient cette pièce jointe
    let zoneId: number | null = null;
    let zoneName = '';

    for (const zone of zones) {
      if (zone.attachments?.some(att => att.url === attachmentUrl)) {
        zoneId = zone.id;
        zoneName = zone.name;
        break;
      }
    }

    if (!zoneId) {
      console.error('❌ Impossible de trouver la zone pour cette pièce jointe:', attachmentUrl);
      toast({ title: 'Erreur', description: 'Impossible de trouver la zone associée à cette pièce jointe' });
      return;
    }

    // Appeler la fonction deleteAttachment qui fait le vrai travail
    await deleteAttachment(attachmentUrl, zoneId);
  };

  const deleteAttachment = async (attachmentUrl: string, zoneId: number) => {
    try {
      console.log('🔍 DÉBUT SUPPRESSION PIÈCE JOINTE');
      console.log('📁 URL:', attachmentUrl);
      console.log('🏷️ Zone ID:', zoneId);

      // Trouver la zone à mettre à jour
      const zoneToUpdate = zones.find(z => z.id === zoneId);
      if (!zoneToUpdate) {
        console.error('❌ Zone non trouvée:', zoneId);
        toast({ title: 'Erreur', description: 'Zone non trouvée' });
        return;
      }

      console.log('✅ Zone trouvée:', zoneToUpdate.name);
      console.log('📎 Pièces jointes AVANT:', zoneToUpdate.attachments?.length || 0);

      // Vérifier si l'URL existe dans les pièces jointes
      const attachmentExists = zoneToUpdate.attachments?.some(att => att.url === attachmentUrl);
      console.log('🔍 Pièce jointe existe:', attachmentExists);

      if (!attachmentExists) {
        console.error('❌ Pièce jointe non trouvée dans la zone:', attachmentUrl);
        toast({ title: 'Erreur', description: 'Pièce jointe non trouvée' });
        return;
      }

      // Filtrer les pièces jointes pour supprimer celle sélectionnée
      const updatedAttachments = zoneToUpdate.attachments?.filter(att => {
        const shouldKeep = att.url !== attachmentUrl;
        console.log(`🗑️ ${shouldKeep ? '✅ GARDE' : '❌ SUPPRIME'}:`, att.url);
        return shouldKeep;
      }) || [];

      console.log('📎 Pièces jointes APRÈS:', updatedAttachments.length);

      // Utiliser FormData pour la mise à jour
      const formData = new FormData();
      formData.append('name', zoneToUpdate.name);
      formData.append('type', zoneToUpdate.type);
      formData.append('status', zoneToUpdate.status || 'active');
      formData.append('color', zoneToUpdate.color || getZoneTypeColor(zoneToUpdate.type));

      // Ajouter les pièces jointes mises à jour (même si vide pour indiquer une suppression)
      if (updatedAttachments.length === 0) {
        formData.append('attachments', '[]'); // Tableau vide explicite
        console.log('📎 Envoi tableau vide explicite pour suppression complète');
      } else {
        formData.append('attachments', JSON.stringify(updatedAttachments));
      }

      console.log('🚀 Envoi requête PUT à /api/zones/' + zoneId);
      const response = await apiRequest('PUT', `/api/zones/${zoneId}`, formData);
      console.log('📡 Réponse API:', response);

      if (!response.ok) {
        throw new Error('Échec de la mise à jour de la zone');
      }

      // ✅ Mise à jour IMMÉDIATE de l'état local pour une meilleure UX
      console.log('🔄 Mise à jour immédiate de l\'état local...');
      setZones(prevZones =>
        prevZones.map(zone =>
          zone.id === zoneId
            ? { ...zone, attachments: updatedAttachments }
            : zone
        )
      );
      console.log('✅ État local mis à jour immédiatement');

      // ✅ Suppression définitive - pas de rechargement automatique pour éviter la resynchronisation
      console.log('✅ Suppression définitive effectuée - pas de rechargement automatique');
      toast({ title: '✅ Succès', description: 'Pièce jointe supprimée définitivement' });
      setPreviewAttachment(null);

    } catch (error: any) {
      console.error('❌ Erreur lors de la suppression:', error);
      toast({
        title: '❌ Erreur',
        description: error?.message || 'Impossible de supprimer la pièce jointe'
      });
    }
  };
  const [zoneTypesConfig, setZoneTypesConfig] = useState<ZoneTypeConfig[]>([]);
  const [zoneStatusesConfig, setZoneStatusesConfig] = useState<ZoneStatusConfig[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    if (!pendingMapType) return;
    if (zoneTypesConfig.length > 0) {
      const desired = normalize(pendingMapType);
      const match = zoneTypesConfig.find(t => normalize(t.key) === desired);
      setTypeFilter(match ? match.key : pendingMapType);
      setPendingMapType(null);
    }
  }, [pendingMapType, zoneTypesConfig]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'mapPage.toggles') return;
      try {
        const t = e.newValue ? JSON.parse(e.newValue) : null;
        if (!t) return;
        const mapping: Array<{flag: boolean, type: string}> = [
          { flag: !!t.showZics, type: 'zic' },
          { flag: !!t.showAmodiees, type: 'amodiee' },
          { flag: !!t.showParcVisite, type: 'parc_visite' },
          { flag: !!t.showRegulation, type: 'regulation' },
        ];
        const enabled = mapping.filter(m => m.flag).map(m => m.type);
        if (enabled.length >= 1) {
          const desired = normalize(enabled[0]);
          const match = zoneTypesConfig.find(z => normalize(z.key) === desired);
          setTypeFilter(match ? match.key : enabled[0]);
        } else {
          setTypeFilter('all');
        }
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [zoneTypesConfig]);

  // États principaux
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // États pour l'ouverture/fermeture des différentes modales
  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDetailZoneId, setOpenDetailZoneId] = useState<number | null>(null);

  // États pour la gestion des pièces jointes
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [openAttachmentsZoneId, setOpenAttachmentsZoneId] = useState<number | null>(null);
  const [openCoordinatesZoneId, setOpenCoordinatesZoneId] = useState<number | null>(null);
  const [editCoordinates, setEditCoordinates] = useState<{ latitude: string; longitude: string }[]>([
    { latitude: "", longitude: "" }
  ]);
  const [editCoordinateSystem, setEditCoordinateSystem] = useState<'geographic' | 'utm'>("utm");
  const [editCoordinateSystemLocked, setEditCoordinateSystemLocked] = useState(false);
  // Verrouillage du système de coordonnées après import CSV (formulaire d'ajout)
  const [coordinateSystemLocked, setCoordinateSystemLocked] = useState(false);
  // Contrôle de la modification de la localisation dans le modal d'édition
  const [allowLocationEdit, setAllowLocationEdit] = useState(false);
  // Aperçu du fichier CSV de coordonnées importé (style QGIS)
  const [coordsFilePreview, setCoordsFilePreview] = useState<{
    fileName: string;
    size: number;
    headers: string[];
    rows: string[][];
    detectedSystem: 'geographic' | 'utm';
  } | null>(null);

  // États pour l'upload de shapefile dans le formulaire d'ajout de zone
  const [uploadedShapefiles, setUploadedShapefiles] = useState<{
    shp: File | null;
    shx: File | null;
    dbf: File | null;
    prj: File | null;
  }>({
    shp: null,
    shx: null,
    dbf: null,
    prj: null,
  });
  const [uploadingShapefile, setUploadingShapefile] = useState(false);
  // Résumé dérivé des coordonnées (centre + type de couche)
  const [coordsDerived, setCoordsDerived] = useState<{
    pointCount: number;
    centroid?: { lat: number; lon: number } | null;
    geometryType: 'none' | 'point' | 'polygon';
  }>({ pointCount: 0, centroid: null, geometryType: 'none' });
  const canCreateGeometry = useMemo(() => {
    return coordsDerived.geometryType === 'point' || coordsDerived.geometryType === 'polygon';
  }, [coordsDerived.geometryType]);
  // Aperçu intégré des documents (PDF / images)
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    name?: string;
    mime?: string;
  } | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneItem | null>(null);
  // Filtre par type
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // Mode d'affichage: cartes (par défaut) ou liste compacte
  const [displayMode, setDisplayMode] = useState<'cards' | 'list'>('cards');
  // Type union pour les coordonnées (géographiques ou UTM simplifié pour le Sénégal)
  type Coordinate = { latitude: string; longitude: string } | { easting: string; northing: string; utmZone: string };

  // Export CSV (Excel) des zones filtrées
  const exportZonesToCSV = () => {
    try {
      // Délimiteur ; pour Excel FR + BOM UTF-8 pour les accents
      const dlm = ';';
      const rows = filteredZones.map(z => ({
        'Nom': z.name ?? '',
        'Type': getZoneTypeLabel(z.type || ''),
        'Région': z.region || '',
        'Département': z.departement || '',
        'Superficie (km²)': z.area_sq_km != null ? Number(z.area_sq_km).toFixed(2).replace('.', ',') : '',
        'Statut': getZoneStatusLabel(z.status || 'active'),
        'Centre (lat, lon)': (z.centroid_lat && z.centroid_lon)
          ? `${Number(z.centroid_lat).toFixed(4).replace('.', ',')}, ${Number(z.centroid_lon).toFixed(4).replace('.', ',')}`
          : ''
      }));
      const headers = Object.keys(rows[0] || { 'Nom': '', 'Type': '', 'Région': '', 'Département': '', 'Superficie (km²)': '', 'Statut': '', 'Centre (lat, lon)': '' });
      const escapeCell = (s: string) => {
        const needsQuotes = /[";\n]/.test(s);
        const esc = s.replace(/"/g, '""');
        return needsQuotes ? `"${esc}"` : esc;
      };
      const csv = [headers.join(dlm), ...rows.map(r => headers.map(h => escapeCell(String((r as any)[h] ?? ''))).join(dlm))].join('\n');
      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zones.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export CSV error:', e);
      toast({ title: 'Erreur export', description: 'Impossible de générer le fichier CSV', variant: 'destructive' });
    }
  };

  // Export PDF via fenêtre d'impression (imprimer en PDF)
  const exportZonesToPDF = () => {
    try {
      const rows = filteredZones;
      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Zones</title>
      <style>
      body{font-family: Arial, sans-serif; padding:16px;}
      h1{font-size:18px; margin:0 0 12px 0}
      table{width:100%; border-collapse:collapse; font-size:12px}
      th,td{border:1px solid #ddd; padding:6px; text-align:left}
      th{background:#f3f4f6}
      </style></head><body>
      <h1>Liste des zones (${rows.length})</h1>
      <table><thead><tr>
      <th>Nom</th><th>Type</th><th>Région</th><th>Département</th><th>Superficie (km²)</th><th>Statut</th><th>Centre</th>
      </tr></thead><tbody>
      ${rows.map(z => `<tr>
        <td>${(z.name||'').toString().replace(/</g,'&lt;')}</td>
        <td>${getZoneTypeLabel(z.type||'')}</td>
        <td>${(z.region||'')}</td>
        <td>${(z.departement||'')}</td>
        <td>${z.area_sq_km ? Number(z.area_sq_km).toFixed(2) : ''}</td>
        <td>${getZoneStatusLabel(z.status||'active')}</td>
        <td>${(z.centroid_lat&&z.centroid_lon)?`${Number(z.centroid_lat).toFixed(4)}, ${Number(z.centroid_lon).toFixed(4)}`:''}</td>
      </tr>`).join('')}
      </tbody></table>
      </body></html>`;
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      // Laisser l'utilisateur choisir "Enregistrer en PDF"
      w.print();
    } catch (e) {
      console.error('Export PDF error:', e);
      toast({ title: 'Erreur export', description: 'Impossible de générer le PDF', variant: 'destructive' });
    }
  };

  // Import CSV pour remplir les coordonnées du formulaire d'ajout (sans dépendance externe)
  const onExcelFileChange = async (file?: File | null) => {
    try {
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) {
        toast({ title: 'Import', description: 'Fichier vide ou sans données.' });
        return;
      }
      const headerLine = lines[0];
      const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
      const splitCsv = (line: string) => {
        const pattern = delimiter === ','
          ? /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/
          : /;(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/;
        return line.split(pattern).map(s => s.trim().replace(/^\"|\"$/g, ''));
      };
      const headersRaw = splitCsv(headerLine);
      // Normalisation robuste: minuscules, suppression accents, remplace tout sauf a-z0-9 par rien
      const norm = (s: string) => String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
      const headers = headersRaw.map(h => ({ raw: h, key: norm(h) }));
      const findCol = (...cands: string[]) => {
        const normCands = cands.map(norm);
        const hit = headers.find(h => normCands.includes(h.key));
        return hit ? headersRaw[headers.indexOf(hit)] : undefined;
      };

      const rows = lines.slice(1).map(splitCsv).filter(r => r.length > 0);
      const idx = (name?: string) => (name ? headersRaw.indexOf(name) : -1);

      // Détection colonnes
      const latCol = findCol('lat', 'latitude', 'y');
      const lonCol = findCol('lon', 'longitude', 'x');
      const eastCol = findCol('easting', 'east', 'e', 'x');
      const northCol = findCol('northing', 'north', 'n', 'y');
      const zoneCol = findCol('zone', 'utm', 'utmzone');
      const coordCol = findCol('coord', 'coords', 'coordinate', 'coordinates');

      let coordinates: Coordinate[] = [];
      let detectedSystem: 'geographic' | 'utm' = 'geographic';

      if (latCol && lonCol) {
        const ilat = idx(latCol), ilon = idx(lonCol);
        // Vérifier si les valeurs sont en fait des mètres UTM (mal étiquetées)
        const toNum = (s: string) => Number(String(s ?? '').replace(',', '.'));
        const sample = rows.slice(0, Math.min(50, rows.length));
        const lats = sample.map(r => toNum(r[ilat])).filter(n => !isNaN(n));
        const lons = sample.map(r => toNum(r[ilon])).filter(n => !isNaN(n));
        const maxAbsLat = Math.max(...(lats.length ? lats.map(v => Math.abs(v)) : [0]));
        const maxAbsLon = Math.max(...(lons.length ? lons.map(v => Math.abs(v)) : [0]));
        const looksUTM = (maxAbsLat > 1000 && maxAbsLon > 1000); // mètres

        if (looksUTM) {
          // Données UTM mal étiquetées: Latitude=Northing, Longitude=Easting
          detectedSystem = 'utm';
          coordinates = rows.map(r => ({
            easting: String(r[ilon] ?? '').replace(',', '.'),    // Longitude → Easting
            northing: String(r[ilat] ?? '').replace(',', '.'),   // Latitude → Northing
            utmZone: '28N',
          })) as any;
        } else {
          // Vraies coordonnées géographiques
          detectedSystem = 'geographic';
          coordinates = rows.map(r => ({
            latitude: String(r[ilat] ?? '').replace(',', '.'),
            longitude: String(r[ilon] ?? '').replace(',', '.'),
          }));
        }
      } else if (eastCol && northCol) {
        detectedSystem = 'utm';
        const ie = idx(eastCol), in_ = idx(northCol), iz = idx(zoneCol);
        coordinates = rows.map(r => ({
          easting: String(r[ie] ?? '').replace(',', '.'),
          northing: String(r[in_] ?? '').replace(',', '.'),
          utmZone: String((iz >= 0 ? r[iz] : '28N') || '28N'),
        })) as any;
      } else if (coordCol) {
        // Colonne unique coord = "lat,lon" ou "lon,lat" (on essaie lat,lon d'abord)
        const ic = idx(coordCol);
        detectedSystem = 'geographic';
        coordinates = rows.map(r => {
          const val = String(r[ic] ?? '');
          const parts = val.split(/[;,\s]+/).map(x => x.replace(',', '.'));
          // Heuristique: si |lon| > |lat| et lon ≈ [-20,-10], inverser
          let a = parts[0], b = parts[1];
          if (!a || !b) return { latitude: '', longitude: '' } as any;
          const na = Number(a), nb = Number(b);
          if (!isNaN(na) && !isNaN(nb)) {
            const looksLonFirst = (na < 0 && na >= -180 && nb >= -90 && nb <= 90);
            return looksLonFirst
              ? { latitude: String(nb), longitude: String(na) }
              : { latitude: String(na), longitude: String(nb) };
          }
          return { latitude: '', longitude: '' } as any;
        });
      } else {
        // Détection intelligente basée sur les colonnes génériques X/Y et les plages numériques
        const keys = headers.map(h => h.key);
        const xIndex = keys.findIndex(k => k === 'x' || k.endsWith('x') || k.includes('coordonnee') && k.endsWith('x') || k.includes('coordonneesx'));
        const yIndex = keys.findIndex(k => k === 'y' || k.endsWith('y') || k.includes('coordonnee') && k.endsWith('y') || k.includes('coordonneesy'));

        if (xIndex >= 0 && yIndex >= 0) {
          const toNum = (s: string) => Number(String(s ?? '').replace(',', '.'));
          const sample = rows.slice(0, Math.min(50, rows.length));
          const xs = sample.map(r => toNum(r[xIndex])).filter(n => !isNaN(n));
          const ys = sample.map(r => toNum(r[yIndex])).filter(n => !isNaN(n));
          const maxAbsX = Math.max(...(xs.length ? xs.map(v => Math.abs(v)) : [0]));
          const maxAbsY = Math.max(...(ys.length ? ys.map(v => Math.abs(v)) : [0]));
          const looksUTM = (maxAbsX > 1000 && maxAbsY > 1000); // mètres

          if (looksUTM) {
            detectedSystem = 'utm';
            coordinates = rows.map(r => ({
              easting: String(r[xIndex] ?? '').replace(',', '.'),
              northing: String(r[yIndex] ?? '').replace(',', '.'),
              utmZone: '28N',
            })) as any;
          } else {
            detectedSystem = 'geographic';
            // Essayer d'inférer si X est lon et Y est lat (cas Sénégal lon ~ -17, lat ~ 12-17)
            const med = (arr: number[]) => {
              if (!arr.length) return 0;
              const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2);
              return s.length % 2 ? s[m] : (s[m-1]+s[m])/2;
            };
            const medX = med(xs), medY = med(ys);
            const xLonLikely = (medX <= 180 && medX >= -180) && (medX < 0); // ouest
            const yLatLikely = (medY <= 90 && medY >= -90);
            const lonIsX = xLonLikely && yLatLikely;
            coordinates = rows.map(r => ({
              latitude: String(lonIsX ? r[yIndex] : r[xIndex] ?? '').replace(',', '.'),
              longitude: String(lonIsX ? r[xIndex] : r[yIndex] ?? '').replace(',', '.'),
            }));
          }
        } else {
          // Toujours afficher un aperçu même si non détecté
          setCoordsFilePreview({
            fileName: file.name,
            size: file.size,
            headers: headersRaw,
            rows: rows.slice(0, Math.min(20, rows.length)),
            detectedSystem,
          });
          toast({ title: 'Import', description: 'Colonnes non détectées. Utilisez Latitude/Longitude (ou Easting/Northing/Zone).', variant: 'destructive' });
          return;
        }
      }

      // Nettoyer lignes vides
      coordinates = coordinates.filter((c: any) => detectedSystem === 'geographic'
        ? (c.latitude && c.longitude)
        : (c.easting && c.northing)
      );

      if (!coordinates.length) {
        // Afficher au moins l'aperçu
        setCoordsFilePreview({
          fileName: file.name,
          size: file.size,
          headers: headersRaw,
          rows: rows.slice(0, Math.min(20, rows.length)),
          detectedSystem,
        });
        toast({ title: 'Import', description: 'Aucun point valide trouvé.' });
        return;
      }

      setForm(prev => ({
        ...prev,
        coordinateSystem: detectedSystem,
        coordinates: coordinates as any,
      }));

      // Verrouiller le système détecté pour éviter les incohérences
      setCoordinateSystemLocked(true);

      // Déduire automatiquement la région à partir du centroïde
      const centroid = calculateCentroid(coordinates as any, detectedSystem);
      if (centroid) {
        const detectedRegion = await findRegionFromPoint(centroid.lat, centroid.lon);
        if (detectedRegion) {
          setForm(prev => ({
            ...prev,
            region: detectedRegion
          }));
          console.log('✅ Région détectée automatiquement:', detectedRegion);
          toast({
            title: 'Import réussi',
            description: `${coordinates.length} point(s) importé(s) - Région: ${detectedRegion}`
          });
        } else {
          toast({ title: 'Import réussi', description: `${coordinates.length} point(s) importé(s)` });
        }
      } else {
        toast({ title: 'Import réussi', description: `${coordinates.length} point(s) importé(s)` });
      }
    } catch (e: any) {
      console.error('Import CSV error:', e);
      toast({ title: 'Erreur import', description: e?.message || 'Impossible de lire le fichier', variant: 'destructive' });
    }
  };

  const [form, setForm] = useState({
    name: "",
    type: "zic",
    region: "",
    departement: "",
    coordinateSystem: "utm", // Par défaut: WGS84 / UTM zone 28N
    coordinates: [] as Coordinate[], // AUCUN point par défaut; l'utilisateur ajoute manuellement
  });
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PERSIST_KEY) : null;
      let appliedFromPersist = false;
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (typeof data.activeTab === 'string') setActiveTab(data.activeTab);
          if (typeof data.searchQuery === 'string') setSearchQuery(data.searchQuery);
          if (typeof data.currentPage === 'number' && data.currentPage > 0) setCurrentPage(data.currentPage);
          if (typeof data.typeFilter === 'string') { setTypeFilter(data.typeFilter); appliedFromPersist = true; }
          if (data.displayMode === 'cards' || data.displayMode === 'list') setDisplayMode(data.displayMode);
          if (data.form && typeof data.form === 'object') {
            const f = data.form;
            setForm(prev => ({
              name: typeof f.name === 'string' ? f.name : prev.name,
              type: typeof f.type === 'string' ? f.type : prev.type,
              region: typeof f.region === 'string' ? f.region : prev.region,
              departement: typeof f.departement === 'string' ? f.departement : prev.departement,
              coordinateSystem: f.coordinateSystem === 'geographic' || f.coordinateSystem === 'utm' ? f.coordinateSystem : prev.coordinateSystem,
              coordinates: Array.isArray(f.coordinates) ? f.coordinates : prev.coordinates,
            }));
          }
          setInitializedFromStorage(true);
        }
      }

      // Si aucun typeFilter persistant, synchroniser avec les toggles de la carte
      if (!appliedFromPersist) {
        const mapRaw = typeof window !== 'undefined' ? window.localStorage.getItem('mapPage.toggles') : null;
        if (mapRaw) {
          try {
            const t = JSON.parse(mapRaw) || {};
            const mapping: Array<{flag: boolean, type: string}> = [
              { flag: !!t.showZics, type: 'zic' },
              { flag: !!t.showAmodiees, type: 'amodiee' },
              { flag: !!t.showParcVisite, type: 'parc_visite' },
              { flag: !!t.showRegulation, type: 'regulation' },
            ];
            const enabled = mapping.filter(m => m.flag).map(m => m.type);
            if (enabled.length >= 1) {
              // Choisir le premier activé par priorité (ZIC > Amodiée > Parc de visite > Régulation)
              setPendingMapType(enabled[0]);
            } else {
              setTypeFilter('all');
            }
          } catch {}
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const payload = {
        activeTab,
        searchQuery,
        currentPage,
        typeFilter,
        displayMode,
        form,
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
      }
    } catch {}
  }, [activeTab, searchQuery, currentPage, typeFilter, displayMode, form]);
  // Verrouillage des champs Région/Département après détection automatique
  const [locationLocked, setLocationLocked] = useState(false);
  // Boîte de dialogue informative en cas de périmètre hors autorisation
  const [scopeDialog, setScopeDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' });

  // Déterminer le type d'agent pour verrouiller la localisation
  const isRegionalAgent = !!(user && user.role === 'agent' && user.type !== 'secteur');
  const isSectorAgent = !!(user && ((user.role === 'agent' && user.type === 'secteur') || user.role === 'sub-agent') && user.departement);

  // Titre et sous-titre dynamiques selon le rôle
  const headerTitle = isRegionalAgent
    ? 'Zones Région'
    : (isSectorAgent ? 'Zones' : 'Régions et Zones');
  const headerSubtitle = isRegionalAgent
    ? 'Gérez et visualisez les zones de votre Région'
    : (isSectorAgent ? 'Gérez et visualisez les zones de votre département' : 'Gérez et visualisez les zones du Sénégal avec précision');

  // Autorisations d'édition selon le créateur de la zone
  const normalizeText = (s?: string | null) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
  const getCreatorLevel = (createdBy?: string | null): 'admin' | 'regional' | 'sector' | 'unknown' => {
    const c = normalizeText(createdBy);
    if (!c) return 'unknown';
    if (c.includes('admin')) return 'admin';
    if (c.includes('region') || c.includes('iref')) return 'regional';
    if (c.includes('secteur') || c.includes('sector') || c.includes('dept') || c.includes('departement')) return 'sector';
    return 'unknown';
  };
  const canEditZone = (zone: ZoneItem) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin: tout
    const creator = getCreatorLevel(zone.created_by);
    if ((user.role === 'agent' || user.role === 'sub-agent') && creator === 'admin') return false; // admin -> agents interdits
    if ((isSectorAgent || user.role === 'sub-agent') && creator === 'regional') return false; // regional -> secteur/sub interdits
    // Autoriser l'agent régional à modifier les zones créées par un agent de secteur de sa région uniquement
    if (isRegionalAgent && creator === 'sector') {
      const zoneReg = normalizeText(zone.region);
      const userReg = normalizeText(String(user.region || ''));
      return !!zoneReg && zoneReg === userReg;
    }
    return true;
  };

  // Fonction de normalisation pour comparaisons (accessible partout dans le composant)
  const normalize = (s?: string | null) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Préremplir et verrouiller Région/Département selon le rôle de l'agent
  useEffect(() => {
    if (initializedFromStorage) return;
    if (isRegionalAgent) {
      setForm(prev => ({ ...prev, region: String(user?.region || '') }));
      setImportForm(prev => ({ ...prev, region: String(user?.region || '') }));
      setLocationLocked(true);
    }
    if (isSectorAgent) {
      setForm(prev => ({ ...prev, departement: String(user?.departement || '') }));
      setImportForm(prev => ({ ...prev, departement: String(user?.departement || '') }));
      setLocationLocked(true);
    }
  }, [initializedFromStorage, isRegionalAgent, isSectorAgent, user?.region, user?.departement]);

  // Recalcule en direct le centre et le type de couche dès que des points sont saisis ou importés
  useEffect(() => {
    const detectRegion = async () => {
      try {
        const coords = form.coordinates || [];
        const valid = (coords as any[]).filter(c =>
          form.coordinateSystem === 'geographic'
            ? (c?.latitude?.trim?.() && c?.longitude?.trim?.())
            : (c?.easting && c?.northing)
        );
        const count = valid.length;
        let geometryType: 'none' | 'point' | 'polygon' = 'none';
        if (count === 1) geometryType = 'point';
        else if (count >= 3) geometryType = 'polygon';
        const centroid = count > 0 ? calculateCentroid(valid as any, form.coordinateSystem) : null;
        setCoordsDerived({ pointCount: count, centroid, geometryType });

        // Déduire automatiquement la région (et le département) à partir du centroïde
        if (centroid && count > 0) {
          console.log(`[Frontend] Tentative détection région pour centroïde: lat=${centroid.lat}, lon=${centroid.lon}`);
          const detectedRegion = await findRegionFromPoint(centroid.lat, centroid.lon);
          if (!detectedRegion) {
            console.warn('⚠️ Aucune région détectée pour ce centroïde');
            setLocationLocked(false);
            return;
          }
          // Définir la région, puis tenter de détecter le département
          setForm(prev => ({ ...prev, region: detectedRegion }));
          console.log('✅ Région détectée automatiquement:', detectedRegion);
          const detectedDep = await findDepartementFromPoint(centroid.lat, centroid.lon);
          if (detectedDep) {
            setForm(prev => ({ ...prev, departement: detectedDep }));
            setLocationLocked(true); // verrouiller après détection complète
            console.log('✅ Département détecté automatiquement:', detectedDep);
          } else {
            setLocationLocked(false);
          }
        }
      } catch {
        setCoordsDerived({ pointCount: 0, centroid: null, geometryType: 'none' });
      }
    };
    detectRegion();
  }, [form.coordinates, form.coordinateSystem]);
  const [editForm, setEditForm] = useState({
    id: 0,
    name: "",
    type: "zic",
    status: "active",
    responsible_name: "",
    responsible_phone: "",
    responsible_email: "",
    responsible_photo: null as File | null,
    attachments: [] as File[],
    notes: "",
    guides_count: "",
    trackers_count: "",
    region: "",
    departement: "",
    commune: "",
    arrondissement: "",
  });
  const [importForm, setImportForm] = useState({
    name: "",
    type: "zic",
    region: "",
    departement: "",
    file: null as File | null,
  });

  // Récupérer les pièces jointes de la zone actuelle
  const currentZone = zones.find(z => z.id === openAttachmentsZoneId);
  const existingAttachments = currentZone?.attachments || [];

  // Fonctions pour la gestion des pièces jointes
  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      // Vérifier la taille (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Fichier trop volumineux',
          description: `${file.name} dépasse la limite de 10MB`,
          variant: 'destructive'
        });
        return false;
      }
      return true;
    });

    setNewAttachments(prev => [...prev, ...validFiles]);
  };

  const removeNewAttachment = (index: number) => {
    setNewAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async () => {
    if (!openAttachmentsZoneId || newAttachments.length === 0) return;

    try {
      setUploadingAttachments(true);

      const formData = new FormData();
      newAttachments.forEach((file, index) => {
        formData.append(`attachment_${index}`, file);
      });

      // Ajouter les informations de la zone
      const zone = zones.find(z => z.id === openAttachmentsZoneId);
      if (zone) {
        formData.append('name', zone.name);
        formData.append('type', zone.type);
        formData.append('status', zone.status || 'active');
        formData.append('color', zone.color || getZoneTypeColor(zone.type));
      }

      await apiRequest('PUT', `/api/zones/${openAttachmentsZoneId}`, formData);

      toast({
        title: 'Succès',
        description: `${newAttachments.length} fichier(s) uploadé(s) avec succès`
      });

      setNewAttachments([]);
      await loadZones(true); // Recharger pour voir les nouvelles pièces jointes
    } catch (error: any) {
      console.error('Erreur upload pièces jointes:', error);
      toast({
        title: 'Erreur',
        description: error?.message || 'Échec de l\'upload'
      });
    } finally {
      setUploadingAttachments(false);
    }
  };

  // Fonction de suppression de zone avec gestion des couches de carte
  const deleteZone = async (zoneId: number) => {
    try {
      console.log('🗺️ Suppression de zone avec gestion des couches de carte:', zoneId);

      // 1. Supprimer la zone du backend
      const response = await apiRequest('DELETE', `/api/zones/${zoneId}`);

      if (!response.ok) {
        throw new Error('Échec de la suppression de la zone');
      }

      // 2. Supprimer la couche de la carte (si elle existe)
      await removeZoneFromMap(zoneId);

      // 3. Recharger les zones pour mettre à jour l'affichage
      await loadZones(true);

      toast({
        title: '✅ Succès',
        description: 'Zone supprimée avec succès'
      });

    } catch (error: any) {
      console.error('❌ Erreur lors de la suppression de zone:', error);
      toast({
        title: '❌ Erreur',
        description: error?.message || 'Impossible de supprimer la zone'
      });
    }
  };

  // Fonction pour supprimer la couche de la carte
  const removeZoneFromMap = async (zoneId: number) => {
    try {
      console.log('🗺️ Suppression de la couche de carte pour zone:', zoneId);

      // TODO: Implémenter la logique de suppression de couche de carte
      // Cette fonction sera appelée quand une carte interactive sera ajoutée
      // Exemples d'implémentation possibles :

      // 1. Si vous utilisez Leaflet :
      // if (window.map && window.mapLayers && window.mapLayers[zoneId]) {
      //   window.map.removeLayer(window.mapLayers[zoneId]);
      //   delete window.mapLayers[zoneId];
      // }

      // 2. Si vous utilisez OpenLayers :
      // if (window.map && window.vectorLayers && window.vectorLayers[zoneId]) {
      //   window.map.removeLayer(window.vectorLayers[zoneId]);
      //   delete window.vectorLayers[zoneId];
      // }

      // 3. Si vous utilisez Mapbox GL JS :
      // if (window.map && window.map.getLayer(`zone-${zoneId}`)) {
      //   window.map.removeLayer(`zone-${zoneId}`);
      //   window.map.removeSource(`zone-${zoneId}`);
      // }

      // 4. API générique pour différents providers de cartes :
      // await apiRequest('DELETE', `/api/map/layers/zones/${zoneId}`);

      console.log('✅ Couche de carte supprimée (ou fonction prête pour implémentation future)');

    } catch (error: any) {
      console.error('❌ Erreur lors de la suppression de la couche de carte:', error);
      // Ne pas bloquer la suppression de zone si la suppression de couche échoue
    }
  };

  // Fonction d'import CSV corrigée avec gestion d'erreurs améliorée
  const onSubmitImport = async () => {
    try {
      if (!importForm.file) {
        toast({ title: 'Validation', description: 'Veuillez sélectionner un fichier CSV.' });
        return;
      }
      if (!importForm.name.trim()) {
        toast({ title: 'Validation', description: 'Veuillez renseigner le nom de la zone.' });
        return;
      }

      // Validation pour agents: vérifier que la zone est dans leur périmètre
      console.log('[Import] Validation périmètre:', { isRegionalAgent, isSectorAgent, region: importForm.region, dep: importForm.departement });

      if (isRegionalAgent && importForm.region) {
        const normalizedFormRegion = String(importForm.region || '').toLowerCase().trim();
        const normalizedUserRegion = String(user?.region || '').toLowerCase().trim();
        console.log('[Import] Comparaison région:', { form: normalizedFormRegion, user: normalizedUserRegion });

        if (normalizedFormRegion !== normalizedUserRegion) {
          console.log('[Import] ❌ Région non autorisée');
          setScopeDialog({
            open: true,
            title: 'Accès non autorisé',
            message: `Vous n'êtes pas autorisé à importer une zone hors de votre région (${String(user?.region || '')}).`
          });
          return;
        }
      }

      if (isSectorAgent && importForm.departement) {
        const normalizedFormDep = String(importForm.departement || '').toLowerCase().trim();
        const normalizedUserDep = String(user?.departement || (user as any)?.zone || '').toLowerCase().trim();
        console.log('[Import] Comparaison département:', { form: normalizedFormDep, user: normalizedUserDep });

        if (normalizedFormDep !== normalizedUserDep) {
          console.log('[Import] ❌ Département non autorisé');
          setScopeDialog({
            open: true,
            title: 'Accès non autorisé',
            message: `Vous n'êtes pas autorisé à importer une zone hors de votre département (${String(user?.departement || (user as any)?.zone || '')}).`
          });
          return;
        }
      }

      const formData = new FormData();
      formData.append('file', importForm.file);
      formData.append('name', importForm.name.trim());
      formData.append('type', importForm.type);
      formData.append('color', getZoneTypeColor(importForm.type));
      // Verrouillage côté envoi: forcer région/département selon le rôle
      const regionToUse = isRegionalAgent ? String(user?.region || '') : (importForm.region || '');
      const depToUse = isSectorAgent ? String(user?.departement || '') : (importForm.departement || '');
      if (regionToUse) formData.append('region', regionToUse);
      if (depToUse) formData.append('departement', depToUse);

      console.log('📤 Envoi de l\'importation CSV:', {
        name: importForm.name,
        type: importForm.type,
        file: importForm.file.name,
        size: importForm.file.size
      });

      const response = await apiRequest<any>('POST', '/api/zones/import', formData);
      console.log('📥 Réponse d\'importation:', response);

      if (!response?.ok) {
        const msg = String((response as any)?.error || 'Échec de l\'importation');
        if (msg.toLowerCase().includes('autorisé') || msg.includes('403')) {
          setScopeDialog({ open: true, title: 'Accès non autorisé', message: msg });
        } else {
          toast({ title: '❌ Erreur d\'importation', description: msg });
        }
        return;
      }

      const zoneData = (response as any).data || {};
      {
        toast({
          title: '✅ Succès',
          description: `Zone importée avec succès: ${zoneData.name || importForm.name}`
        });

        // Fermer le dialog
        setOpenImport(false);

        // Réinitialiser le formulaire
        setImportForm({
          name: '',
          type: getDefaultZoneTypeKey(),
          region: '',
          departement: '',
          file: null
        });

        // Recharger les zones pour voir la nouvelle zone
        await loadZones(true);

        console.log('✅ Importation CSV terminée avec succès');
      }

    } catch (error: any) {
      console.error('❌ Erreur lors de l\'importation CSV:', error);
      // Si erreur 403 (périmètre non autorisé), afficher le Dialog informatif
      if (error?.status === 403 || error?.message?.includes('autorisé')) {
        setScopeDialog({
          open: true,
          title: 'Accès non autorisé',
          message: error?.message || 'Vous n\'êtes pas autorisé à effectuer cette action.'
        });
      } else {
        toast({
          title: '❌ Erreur d\'importation',
          description: error?.message || 'Impossible d\'importer le fichier CSV'
        });
      }
    }
  };

  // Charger les paramètres de configuration des zones
  const loadZoneConfig = async () => {
    try {
      setLoadingConfig(true);

      // Cache persistant pour config (24h)
      const ZONE_TYPES_CACHE_KEY = 'regionsZones.zoneTypes';
      const ZONE_STATUSES_CACHE_KEY = 'regionsZones.zoneStatuses';
      const ZONE_CONFIG_TTL_MS = 24 * 60 * 60 * 1000; // 24h

      // Tenter de charger depuis le cache d'abord pour éviter le rechargement visible
      try {
        const now = Date.now();
        const typesCachedRaw = window.localStorage.getItem(ZONE_TYPES_CACHE_KEY);
        const statusesCachedRaw = window.localStorage.getItem(ZONE_STATUSES_CACHE_KEY);
        const typesCached = typesCachedRaw ? JSON.parse(typesCachedRaw) : null;
        const statusesCached = statusesCachedRaw ? JSON.parse(statusesCachedRaw) : null;
        const typesFresh = typesCached && Array.isArray(typesCached.data) && typeof typesCached.cachedAt === 'number' && (now - typesCached.cachedAt) < ZONE_CONFIG_TTL_MS;
        const statusesFresh = statusesCached && Array.isArray(statusesCached.data) && typeof statusesCached.cachedAt === 'number' && (now - statusesCached.cachedAt) < ZONE_CONFIG_TTL_MS;
        if (typesFresh) {
          setZoneTypesConfig(typesCached.data.map((t: any) => ({
            id: Number(t.id),
            key: String(t.key),
            label: String(t.label),
            color: String(t.color ?? '#0ea5e9'),
            isActive: !!(t.isActive ?? t.is_active)
          })));
        }
        if (statusesFresh) {
          setZoneStatusesConfig(statusesCached.data.map((s: any) => ({
            id: Number(s.id),
            key: String(s.key),
            label: String(s.label),
            isActive: !!(s.isActive ?? s.is_active)
          })));
        }
        if (typesFresh && statusesFresh) {
          // Utiliser uniquement le cache si frais
          setLoadingConfig(false);
          return;
        }
      } catch {}

      // Charger les types de zones
      const typesResp = await apiRequest<any>('GET', '/settings/zone-types');
      const typesBody = typesResp?.data as any;
      if (typesResp.ok && typesBody?.ok && Array.isArray(typesBody.data)) {
        setZoneTypesConfig(typesBody.data.map((t: any) => ({
          id: Number(t.id),
          key: String(t.key),
          label: String(t.label),
          color: String(t.color ?? '#0ea5e9'),
          isActive: !!(t.isActive ?? t.is_active)
        })));
        try { window.localStorage.setItem('regionsZones.zoneTypes', JSON.stringify({ data: typesBody.data, cachedAt: Date.now() })); } catch {}
      }

      // Charger les statuts de zones
      const statusesResp = await apiRequest<any>('GET', '/settings/zone-statuses');
      const statusesBody = statusesResp?.data as any;
      if (statusesResp.ok && statusesBody?.ok && Array.isArray(statusesBody.data)) {
        setZoneStatusesConfig(statusesBody.data.map((s: any) => ({
          id: Number(s.id),
          key: String(s.key),
          label: String(s.label),
          isActive: !!(s.isActive ?? s.is_active)
        })));
        try { window.localStorage.setItem('regionsZones.zoneStatuses', JSON.stringify({ data: statusesBody.data, cachedAt: Date.now() })); } catch {}
      }
    } catch (e: any) {
      console.error('Erreur chargement config zones:', e);
      toast({
        title: 'Avertissement',
        description: 'Configuration des zones non disponible. Utilisation des valeurs par défaut.',
        variant: 'default'
      });
      // Utiliser les valeurs par défaut en cas d'erreur
      setZoneTypesConfig(defaultZoneTypes.map((t, index) => ({
        id: index + 1,
        key: t.key,
        label: t.label,
        color: t.color,
        isActive: true
      })));
      setZoneStatusesConfig(defaultZoneStatuses.map((s, index) => ({
        id: index + 1,
        key: s.key,
        label: s.label,
        isActive: true
      })));
    } finally {
      setLoadingConfig(false);
    }
  };

  const ZONES_CACHE_KEY = 'regionsZones.zonesLiteCache';
  const ZONES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const loadZones = async (force = false) => {
    let loadingTimer: number | undefined;
    try {
      setError(null);
      // Try cached data (unless force refresh requested)
      if (!force && typeof window !== 'undefined') {
        try {
          const cachedRaw = window.localStorage.getItem(ZONES_CACHE_KEY);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (cached && Array.isArray(cached.features) && typeof cached.cachedAt === 'number') {
              const age = Date.now() - cached.cachedAt;
              if (age >= 0 && age < ZONES_CACHE_TTL_MS) {
                const features = cached.features as any[];
                const mapped = features.map(f => {
        const status = f.properties?.status || 'active';
        const isInactive = status === 'inactive';
        return {
          id: f.properties?.id,
          name: f.properties?.name,
          type: f.properties?.type,
          status: status,
          color: f.properties?.color,
          // Ajouter des propriétés pour le style sur la carte
          isInactive: isInactive,
          mapColor: isInactive ? '#9ca3af' : (f.properties?.color || getZoneTypeColor(f.properties?.type || '')),
          mapOpacity: isInactive ? 0.5 : 0.8,
          showCrossPattern: isInactive,
          crossPatternColor: '#ff6b6b', // Rouge clair pour les croix
          responsible_name: f.properties?.responsible_name,
          responsible_phone: f.properties?.responsible_phone,
          responsible_email: f.properties?.responsible_email,
          responsible_photo: f.properties?.responsible_photo,
          attachments: f.properties?.attachments,
          notes: f.properties?.notes,
          guides_count: f.properties?.guides_count,
          trackers_count: f.properties?.trackers_count,
          region: f.properties?.region,
          departement: f.properties?.departement,
          commune: f.properties?.commune,
          arrondissement: f.properties?.arrondissement,
          area_sq_km: f.properties?.area_sq_km,
          surface_ha: f.properties?.surface_ha,
          perimetre_m: f.properties?.perimetre_m,
          centroid_lat: f.properties?.centroid_lat,
          centroid_lon: f.properties?.centroid_lon,
          created_by: f.properties?.created_by,
          created_at: f.properties?.created_at,
          updated_at: f.properties?.updated_at,
        };
      }) as ZoneItem[];
                setZones(mapped);
                setLoading(false);
                return;
              }
            }
          }
        } catch {}
      }

      // No fresh cache -> utiliser un spinner différé pour éviter les flashs
      try {
        loadingTimer = window.setTimeout(() => setLoading(true), 250);
      } catch {}
      const resp = await apiRequest<any>('GET', '/api/zones?lite=1');
      const fc = resp?.data as any;
      const features = (fc?.features ?? []) as any[];
      const mapped = features.map(f => {
        const status = f.properties?.status || 'active';
        const isInactive = status === 'inactive';
        return {
          id: f.properties?.id,
          name: f.properties?.name,
          type: f.properties?.type,
          status: status,
          color: f.properties?.color,
          // Ajouter des propriétés pour le style sur la carte
          isInactive: isInactive,
          mapColor: isInactive ? '#9ca3af' : (f.properties?.color || getZoneTypeColor(f.properties?.type || '')),
          mapOpacity: isInactive ? 0.5 : 0.8,
          showCrossPattern: isInactive,
          crossPatternColor: '#ff6b6b', // Rouge clair pour les croix
          responsible_name: f.properties?.responsible_name,
          responsible_phone: f.properties?.responsible_phone,
          responsible_email: f.properties?.responsible_email,
          responsible_photo: f.properties?.responsible_photo,
          attachments: f.properties?.attachments,
          notes: f.properties?.notes,
          guides_count: f.properties?.guides_count,
          trackers_count: f.properties?.trackers_count,
          region: f.properties?.region,
          departement: f.properties?.departement,
          commune: f.properties?.commune,
          arrondissement: f.properties?.arrondissement,
          area_sq_km: f.properties?.area_sq_km,
          surface_ha: f.properties?.surface_ha,
          perimetre_m: f.properties?.perimetre_m,
          centroid_lat: f.properties?.centroid_lat,
          centroid_lon: f.properties?.centroid_lon,
          created_by: f.properties?.created_by,
          created_at: f.properties?.created_at,
          updated_at: f.properties?.updated_at,
        };
      }) as ZoneItem[];
      setZones(mapped);
      // Write to cache with enhanced properties for map styling
      if (typeof window !== 'undefined') {
        try {
          // Enhanced features with map styling properties
          const enhancedFeatures = features.map(f => {
            const status = f.properties?.status || 'active';
            const isInactive = status === 'inactive';
            return {
              ...f,
              properties: {
                ...f.properties,
                isInactive: isInactive,
                mapColor: isInactive ? '#9ca3af' : (f.properties?.color || getZoneTypeColor(f.properties?.type || '')),
                mapOpacity: isInactive ? 0.5 : 0.8,
                showCrossPattern: isInactive
              }
            };
          });
          window.localStorage.setItem(ZONES_CACHE_KEY, JSON.stringify({ features: enhancedFeatures, cachedAt: Date.now() }));
        } catch {}
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Erreur de chargement');
      toast({ title: 'Erreur', description: 'Impossible de charger les zones', });
    } finally {
      try { if (loadingTimer) window.clearTimeout(loadingTimer); } catch {}
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZoneConfig();
    loadZones();
  }, []);

  // Intégrer le bouton "Actualiser" global du header: il émet 'refresh-map-data'.
  // À la réception, on purge le cache local et on recharge depuis l'API.
  useEffect(() => {
    const onGlobalRefresh = () => {
      try { window.localStorage.removeItem(ZONES_CACHE_KEY); } catch {}
      loadZones(true);
    };
    window.addEventListener('refresh-map-data', onGlobalRefresh as EventListener);
    return () => {
      window.removeEventListener('refresh-map-data', onGlobalRefresh as EventListener);
    };
  }, []);

  // Mettre à jour les types par défaut des formulaires après chargement de la config
  useEffect(() => {
    if (zoneTypesConfig.length > 0) {
      const defaultType = getDefaultZoneTypeKey();
      setForm(prev => ({ ...prev, type: defaultType }));
      setImportForm(prev => ({ ...prev, type: defaultType }));
    }
  }, [zoneTypesConfig]);

  useEffect(() => {
    if (zoneStatusesConfig.length > 0) {
      const defaultStatus = getDefaultZoneStatusKey();
      setEditForm(prev => ({ ...prev, status: defaultStatus }));
    }
  }, [zoneStatusesConfig]);

  // Initialiser les coordonnées d'édition quand la modal s'ouvre
  useEffect(() => {
    if (openCoordinatesZoneId) {
      const zone = zones.find(z => z.id === openCoordinatesZoneId);
      if (zone) {
        // Récupérer la géométrie depuis l'API
        loadZoneGeometry(openCoordinatesZoneId);
      }
    }
  }, [openCoordinatesZoneId, zones]);

  // Fonction pour récupérer la géométrie d'une zone spécifique
  const loadZoneGeometry = async (zoneId: number) => {
    try {
      const resp = await apiRequest<any>('GET', `/api/zones/${zoneId}`);
      const zoneData = resp?.data;

      if (zoneData && zoneData.geometry) {
        // Convertir la géométrie GeoJSON en coordonnées lisibles
        const geometry = zoneData.geometry;

        if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates.length > 0) {
          // Extraire les coordonnées du polygone (sans le dernier point qui ferme le polygone)
          const coords = geometry.coordinates[0].slice(0, -1).map((coord: [number, number]) => ({
            latitude: coord[1].toString(), // latitude (Y)
            longitude: coord[0].toString()  // longitude (X)
          }));

          setEditCoordinates(coords.length > 0 ? coords : [
            { latitude: zoneData.centroid_lat?.toString() || "", longitude: zoneData.centroid_lon?.toString() || "" }
          ]);
        } else if (geometry.type === 'Point' && geometry.coordinates) {
          // Point unique
          setEditCoordinates([{
            latitude: geometry.coordinates[1].toString(),
            longitude: geometry.coordinates[0].toString()
          }]);
        } else {
          // Fallback sur le centroïde
          setEditCoordinates([
            { latitude: zoneData.centroid_lat?.toString() || "", longitude: zoneData.centroid_lon?.toString() || "" }
          ]);
        }
      } else {
        // Fallback sur le centroïde si pas de géométrie
        const fallbackZone = zones.find(z => z.id === zoneId);
        if (fallbackZone) {
          setEditCoordinates([
            { latitude: fallbackZone.centroid_lat?.toString() || "", longitude: fallbackZone.centroid_lon?.toString() || "" }
          ]);
        }
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement de la géométrie:', error);
      // En cas d'erreur, fallback sur le centroïde
      const errorFallbackZone = zones.find(z => z.id === zoneId);
      if (errorFallbackZone) {
        setEditCoordinates([
          { latitude: errorFallbackZone.centroid_lat?.toString() || "", longitude: errorFallbackZone.centroid_lon?.toString() || "" }
        ]);
      }
    }
  };

  const filteredZones = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const byQuery = (z: ZoneItem) =>
      (z.name || '').toLowerCase().includes(q) ||
      (z.region || '').toLowerCase().includes(q) ||
      (z.type || '').toLowerCase().includes(q);

    // Pour les agents (régionaux / secteur), on ne filtre pas par type
    // ni par "isActive" afin qu'ils voient toutes les zones de leur territoire
    // (ZIC, amodiée, régulation, parc de visite, ...).
    const isAgent = !!user && (user.role === 'agent' || user.role === 'sub-agent');

    const byType = (z: ZoneItem) => {
      if (isAgent) return true;
      return typeFilter === 'all' ? true : normalize(z.type) === normalize(typeFilter);
    };

    const allowedSet = !isAgent && zoneTypesConfig.length
      ? new Set(zoneTypesConfig.filter(t => t.isActive).map(t => normalize(t.key)))
      : null;

    const byAllowed = (z: ZoneItem) => {
      if (isAgent) return true;
      return allowedSet ? allowedSet.has(normalize(String(z.type || ''))) : true;
    };
    const byLocation = (z: ZoneItem) => {
      if (!user) return true;
      // Admin: voit tout
      if (user.role === 'admin') return true;

      const zoneRegion = normalize(z.region);
      const zoneDep = normalize(z.departement);
      const userRegion = normalize((user as any).region);
      const userDep = normalize((user as any).departement || (user as any).zone);

      // Agents régionaux: privilégier la région, mais ne pas masquer les zones
      // si la région n'est pas renseignée sur la zone.
      if (user.role === 'agent' && userRegion && (user as any).type !== 'secteur') {
        if (zoneRegion) {
          return zoneRegion === userRegion;
        }
        // Pas de région stockée sur la zone -> ne pas filtrer par localisation
        return true;
      }

      // Agents de secteur et sub-agents: si le département est renseigné sur la zone,
      // il doit correspondre à celui de l'utilisateur. Si le département est manquant
      // (cas actuel de certaines protected_zones), on ne la masque pas pour garder
      // une cohérence visuelle avec la carte.
      if ((user.role === 'agent' && (user as any).type === 'secteur' && userDep) || (user.role === 'sub-agent' && userDep)) {
        if (zoneDep) {
          return zoneDep === userDep;
        }
        return true;
      }

      // Autres rôles: pas de restriction supplémentaire
      return true;
    };
    return zones.filter(z => byLocation(z) && byQuery(z) && byType(z) && byAllowed(z));
  }, [zones, searchQuery, typeFilter, user, zoneTypesConfig]);

  // Pagination
  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredZones.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(filteredZones.length / itemsPerPage);
  const paginatedZones = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredZones.length);

  // Réinitialiser la page quand on change de recherche ou de filtre
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter]);

  // Synchroniser les zones avec la carte pour appliquer les styles (zones inactives en gris avec croix)
  useEffect(() => {
    if (zones.length === 0) return;

    try {
      // Vérifier si les données ont déjà été synchronisées récemment pour éviter les boucles
      const lastSync = window.localStorage.getItem('regionsZones.lastSync');
      const now = Date.now();
      if (lastSync && (now - parseInt(lastSync)) < 1000) { // 1 seconde de délai
        return;
      }

      // Convertir les zones en features GeoJSON avec propriétés de style
      const mapFeatures = zones.map(zone => {
        const isInactive = zone.status === 'inactive';
        return {
          type: 'Feature',
          properties: {
            id: zone.id,
            name: zone.name,
            type: zone.type,
            status: zone.status,
            color: zone.color,
            // Propriétés de style pour la carte
            isInactive: isInactive,
            mapColor: isInactive ? '#9ca3af' : (zone.color || getZoneTypeColor(zone.type || '')),
            mapOpacity: isInactive ? 0.5 : 0.8,
            showCrossPattern: isInactive,
            crossPatternColor: '#ff6b6b', // Rouge clair pour les croix
            responsible_name: zone.responsible_name,
            responsible_phone: zone.responsible_phone,
            responsible_email: zone.responsible_email,
            attachments: zone.attachments,
            notes: zone.notes,
            guides_count: zone.guides_count,
            trackers_count: zone.trackers_count,
            region: zone.region,
            departement: zone.departement,
            commune: zone.commune,
            arrondissement: zone.arrondissement,
            area_sq_km: zone.area_sq_km,
            surface_ha: zone.surface_ha,
            perimetre_m: zone.perimetre_m,
            centroid_lat: zone.centroid_lat,
            centroid_lon: zone.centroid_lon,
            created_by: zone.created_by,
            created_at: zone.created_at,
            updated_at: zone.updated_at,
          },
          geometry: null // La géométrie sera chargée séparément par la carte
        };
      });

      // Mettre à jour le cache principal utilisé par la carte (regionsZones.zonesLiteCache)
      const mapData = {
        type: 'FeatureCollection',
        features: mapFeatures,
        cachedAt: Date.now()
      };

      window.localStorage.setItem(ZONES_CACHE_KEY, JSON.stringify(mapData));
      window.localStorage.setItem('regionsZones.lastSync', now.toString());

      // Émettre un événement pour notifier la carte du changement
      window.dispatchEvent(new CustomEvent('zones-updated', {
        detail: { zones: mapFeatures, timestamp: Date.now() }
      }));

      // Forcer un rafraîchissement de la carte uniquement si nécessaire (sans recharger les zones)
      window.dispatchEvent(new CustomEvent('refresh-map-styles-only'));

    } catch (error) {
      console.error('Erreur synchronisation carte:', error);
    }
  }, [zones, zoneTypesConfig]);

  // Fonctions utilitaires pour la configuration dynamique
  const getZoneTypeLabel = (key: string) => {
    const config = zoneTypesConfig.find((t: any) => t.key === key);
    if (config) return config.label;
    const defaultType = defaultZoneTypes.find(t => t.key === key);
    return defaultType?.label || key.toUpperCase();
  };

  const getZoneTypeColor = (key: string) => {
    const config = zoneTypesConfig.find((t: any) => t.key === key);
    if (config) return config.color;
    const defaultType = defaultZoneTypes.find(t => t.key === key);
    return defaultType?.color || '#0ea5e9';
  };

  const getZoneStatusLabel = (key: string) => {
    const config = zoneStatusesConfig.find((s: any) => s.key === key);
    if (config) return config.label;
    const defaultStatus = defaultZoneStatuses.find(s => s.key === key);
    return defaultStatus?.label || key;
  };

  const buildAttachmentUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const withSlash = url.startsWith('/') ? url : `/${url}`;
    // Force direct backend URL to avoid proxy issues with images/iframes
    return `http://127.0.0.1:3000${withSlash}`;
  };

  const openAttachmentPreview = (att: { url: string; name?: string; mime?: string }) => {
    if (!att?.url && !att?.name) {
      toast({ title: 'Erreur', description: 'Aucune information de fichier disponible' });
      return;
    }
    // URL principale depuis la base
    const primary = att?.url ? buildAttachmentUrl(att.url) : '';
    // Fallback par nom original si pas d'URL
    const fallbackByName = att?.name
      ? `${window.location.origin}/uploads/documents/${encodeURIComponent(att.name)}`
      : '';

    let chosen = primary || fallbackByName;
    // Si le type MIME est connu, l'ajouter en query pour forcer le bon Content-Type côté backend
    if (att.mime) {
      try {
        const u = new URL(chosen);
        if (!u.searchParams.get('mime')) {
          u.searchParams.set('mime', att.mime);
          chosen = u.toString();
        }
      } catch {}
    }
    // Debug pour comprendre pourquoi rien ne s'affiche
    try { console.log('[Zones] Preview attachment click', { att, primary, fallbackByName, chosen }); } catch {}
    // Test if the URL is accessible before opening modal
    try {
      fetch(chosen, { method: 'HEAD' }).then(response => {
        console.log('[Zones] File URL test:', {
          url: chosen,
          status: response.status,
          contentType: response.headers.get('content-type'),
          ok: response.ok
        });
      }).catch(err => {
        console.error('[Zones] File URL test failed:', err);
      });
    } catch {}
    try {
      new URL(chosen);
      setPreviewAttachment({ url: chosen, name: att.name, mime: att.mime });
      setIframeError(false); // Réinitialiser l'état d'erreur pour le nouvel aperçu
    } catch (_) {
      toast({ title: 'Erreur', description: `URL invalide: ${chosen}` });
    }
  };

  // Fonctions pour gérer les coordonnées du formulaire d'ajout
  const addCoordinate = () => {
    const newCoord = form.coordinateSystem === "geographic"
      ? { latitude: "", longitude: "" }
      : { easting: "", northing: "", utmZone: "28N" }; // Zone UTM automatique pour le Sénégal

    setForm(prev => ({
      ...prev,
      coordinates: [...prev.coordinates, newCoord]
    }));
  };

  const removeCoordinate = (index: number) => {
    if (form.coordinates.length > 1) {
      setForm(prev => ({
        ...prev,
        coordinates: prev.coordinates.filter((_, i) => i !== index)
      }));
    }
  };

  const updateCoordinate = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      coordinates: prev.coordinates.map((coord, i) =>
        i === index ? { ...coord, [field]: value } : coord
      )
    }));
  };

  // Fonctions pour gérer les coordonnées d'édition
  const addEditCoordinate = () => {
    if (editCoordinateSystem === 'geographic') {
      setEditCoordinates(prev => [...prev, { latitude: "", longitude: "" }]);
    } else {
      // Étendre le tableau en mode any pour intégrer UTM à l'édition
      setEditCoordinates(prev => (prev as any[]).concat([{ easting: "", northing: "", utmZone: "28N" }] as any));
    }
  };

  const removeEditCoordinate = (index: number) => {
    if (editCoordinates.length > 1) {
      setEditCoordinates(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateEditCoordinate = (
    index: number,
    field: 'latitude' | 'longitude' | 'easting' | 'northing' | 'utmZone',
    value: string
  ) => {
    setEditCoordinates(prev => prev.map((coord: any, i) =>
      i === index ? { ...coord, [field]: value } : coord
    ));
  };

  // Calculer le centroïde d'un polygone
  const calculateCentroid = (coordinates: Coordinate[], coordinateSystem: string = "geographic") => {
    const validCoords = coordinates.filter(coord => {
      if (coordinateSystem === "geographic") {
        return (coord as any).latitude.trim() !== '' && (coord as any).longitude.trim() !== '';
      } else {
        return (coord as any).easting && (coord as any).northing; // Zone UTM automatique
      }
    });

    if (validCoords.length === 0) {
      return { lat: 0, lon: 0 };
    }

    if (coordinateSystem === "geographic") {
      const sumLat = validCoords.reduce((sum, coord) => sum + parseFloat((coord as any).latitude), 0);
      const sumLon = validCoords.reduce((sum, coord) => sum + parseFloat((coord as any).longitude), 0);
      return {
        lat: sumLat / validCoords.length,
        lon: sumLon / validCoords.length
      };
    } else {
      // Pour UTM, on calcule le centroïde en UTM puis on le convertit approximativement en géographiques
      const sumEasting = validCoords.reduce((sum, coord) => sum + parseFloat((coord as any).easting), 0);
      const sumNorthing = validCoords.reduce((sum, coord) => sum + parseFloat((coord as any).northing), 0);
      const meanE = sumEasting / validCoords.length;
      const meanN = sumNorthing / validCoords.length;
      const zone = (validCoords[0] as any).utmZone || '28N';
      const { latitude, longitude } = utmToLatLon(meanE, meanN, zone);
      return { lat: latitude, lon: longitude };
    }
  };


  // Fonction pour trouver la région contenant un point donné (utilise PostGIS via API)
  const findRegionFromPoint = async (lat: number, lon: number): Promise<string | null> => {
    try {
      console.log(`[Frontend] Appel API detect-from-point avec lat=${lat}, lon=${lon}`);
      const response = await apiRequest<any>('GET', `/api/regions/detect-from-point?latitude=${lat}&longitude=${lon}`);

      console.log('[Frontend] Réponse API complète:', response);

      // Accéder aux données via response.data
      const data = response?.data;

      if (data?.success && data?.region?.nom) {
        console.log('✅ Région détectée:', data.region.nom);
        return data.region.nom;
      } else {
        console.warn('⚠️ Aucune région trouvée pour le point:', { lat, lon, response });
        return null;
      }
    } catch (error) {
      console.error('Erreur détection région:', error);
      return null;
    }
  };

  // Conversion précise UTM vers Lat/Lon avec proj4
  const utmToLatLon = (easting: number, northing: number, zone: string = "28N"): { latitude: number, longitude: number } => {
    // Extraction du numéro de zone et de l'hémisphère
    const zoneMatch = zone.match(/^(\d+)([NS]?)$/i);
    if (!zoneMatch) {
      throw new Error(`Format de zone UTM invalide: ${zone}`);
    }

    const zoneNumber = parseInt(zoneMatch[1]);
    const hemisphere = zoneMatch[2].toUpperCase() || 'N';

    // Définir la projection UTM (EPSG:32600 + zoneNumber pour Nord, EPSG:32700 + zoneNumber pour Sud)
    const epsgCode = hemisphere === 'N' ? 32600 + zoneNumber : 32700 + zoneNumber;
    const utmProj = `EPSG:${epsgCode}`;
    const wgs84Proj = 'EPSG:4326'; // WGS84 (lat/lon)

    try {
      // Conversion UTM → WGS84 avec proj4
      const [longitude, latitude] = proj4(utmProj, wgs84Proj, [easting, northing]);

      return { latitude, longitude };
    } catch (error) {
      console.error('Erreur conversion UTM→WGS84:', error);
      throw new Error(`Impossible de convertir UTM ${zone} (${easting}, ${northing}) vers WGS84`);
    }
  };

  // Convertir les coordonnées en GeoJSON Polygon
  const coordinatesToGeoJSON = (coordinates: Coordinate[], coordinateSystem: string = "geographic") => {
    let validCoords: Coordinate[];

    if (coordinateSystem === "geographic") {
      validCoords = coordinates.filter(coord =>
        'latitude' in coord && 'longitude' in coord &&
        coord.latitude.trim() !== '' && coord.longitude.trim() !== ''
      );
    } else {
      validCoords = coordinates.filter(coord =>
        'easting' in coord && 'northing' in coord && 'utmZone' in coord &&
        coord.easting && coord.northing && coord.utmZone
      );
    }

    console.log('Valid coordinates count:', validCoords.length);

    if (validCoords.length < 1) {
      throw new Error(`Aucun point valide fourni`);
    }

    // Si un seul point, créer un Point au lieu d'un Polygon
    if (validCoords.length === 1) {
      const coord = validCoords[0];
      let lat: number, lon: number;

      if (coordinateSystem === "geographic") {
        lat = parseFloat((coord as any).latitude);
        lon = parseFloat((coord as any).longitude);
      } else {
        // Convertir UTM vers géographiques (simplifié)
        const utmCoord = coord as any;
        const utmResult = utmToLatLon(parseFloat(utmCoord.easting), parseFloat(utmCoord.northing), utmCoord.utmZone);
        lat = utmResult.latitude;
        lon = utmResult.longitude;
      }

      if (isNaN(lat) || isNaN(lon)) {
        throw new Error(`Coordonnées invalides: lat=${lat}, lon=${lon}`);
      }

      // Validation des plages de coordonnées (Sénégal approximatif)
      if (lat < 12 || lat > 17 || lon < -18 || lon > -11) {
        console.warn(`Coordonnées hors du Sénégal: lat=${lat}, lon=${lon}`);
      }

      return {
        type: "Point",
        coordinates: [lon, lat] // GeoJSON format: [longitude, latitude]
      };
    }

    // Pour 3 points ou plus, créer un Polygon
    if (validCoords.length < 3) {
      throw new Error(`Un polygone nécessite au moins 3 points (${validCoords.length} fournis)`);
    }

    const coords = validCoords.map(coord => {
      let lat: number, lon: number;

      if (coordinateSystem === "geographic") {
        lat = parseFloat((coord as any).latitude);
        lon = parseFloat((coord as any).longitude);
      } else {
        // Convertir UTM vers géographiques
        const utmCoord = coord as any;
        const utmResult = utmToLatLon(parseFloat(utmCoord.easting), parseFloat(utmCoord.northing), utmCoord.utmZone);
        lat = utmResult.latitude;
        lon = utmResult.longitude;
      }

      if (isNaN(lat) || isNaN(lon)) {
        throw new Error(`Coordonnées invalides: lat=${lat}, lon=${lon}`);
      }

      // Validation des plages de coordonnées (Sénégal approximatif)
      if (lat < 12 || lat > 17 || lon < -18 || lon > -11) {
        console.warn(`Coordonnées hors du Sénégal: lat=${lat}, lon=${lon}`);
      }

      return [lon, lat]; // GeoJSON format: [longitude, latitude]
    });

    // Fermer le polygone si ce n'est pas déjà fait
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0], first[1]]);
    }

    return {
      type: "Polygon",
      coordinates: [coords]
    };
  };

  const getDefaultZoneTypeKey = () => {
    const opts = getZoneTypeOptions();
    return opts.length > 0 ? opts[0].key : 'zic';
  };

  const getDefaultZoneStatusKey = () => {
    const activeStatuses = zoneStatusesConfig.filter(s => s.isActive);
    return activeStatuses.length > 0 ? activeStatuses[0].key : 'active';
  };

  // Valeurs par défaut de secours
  const defaultZoneTypes = [
    { key: 'zic', label: 'ZIC', color: '#0ea5e9' },
    { key: 'amodiee', label: 'Amodiée', color: '#10b981' },
    { key: 'parc_visite', label: 'Parc de visite', color: '#f59e0b' },
    { key: 'regulation', label: 'Régulation', color: '#dc2626' }
  ];

  // Fusionner types actifs issus de la config avec les types par défaut manquants
  const getZoneTypeOptions = () => {
    try {
      const allowed = new Set(['zic', 'amodiee', 'parc_visite', 'regulation']);
      const activeFromConfig = (zoneTypesConfig || [])
        .filter(t => t && t.isActive && allowed.has(String(t.key)))
        .map(t => ({ key: String(t.key), label: String(t.label), color: String(t.color ?? '#0ea5e9') }));
      const keysInConfig = new Set((zoneTypesConfig || []).map(t => String(t.key)));
      const missingDefaults = defaultZoneTypes
        .filter(d => allowed.has(d.key) && !keysInConfig.has(d.key));
      const merged = [...activeFromConfig, ...missingDefaults].filter(t => allowed.has(t.key));
      const fallback = defaultZoneTypes.filter(t => allowed.has(t.key));
      return merged.length > 0 ? merged : fallback;
    } catch {
      return defaultZoneTypes.filter(t => ['zic', 'amodiee', 'parc_visite', 'regulation'].includes(t.key));
    }
  };

  const defaultZoneStatuses = [
    { key: 'active', label: 'Actif' },
    { key: 'inactive', label: 'Inactif' },
    { key: 'suspended', label: 'Suspendu' }
  ];

  const onSubmitAdd = async () => {
    try {
      // Valider les coordonnées
      if (!form.name.trim()) {
        toast({ title: 'Validation', description: 'Veuillez saisir le nom de la zone.' });
        return;
      }

      // Validation pour agents: vérifier que la zone est dans leur périmètre
      console.log('[Add] Validation périmètre:', { isRegionalAgent, isSectorAgent, region: form.region, dep: form.departement });

      if (isRegionalAgent && form.region) {
        const normalizedFormRegion = String(form.region || '').toLowerCase().trim();
        const normalizedUserRegion = String(user?.region || '').toLowerCase().trim();
        console.log('[Add] Comparaison région:', { form: normalizedFormRegion, user: normalizedUserRegion });

        if (normalizedFormRegion !== normalizedUserRegion) {
          console.log('[Add] ❌ Région non autorisée');
          setScopeDialog({
            open: true,
            title: 'Accès non autorisé',
            message: `Vous n'êtes pas autorisé à ajouter une zone hors de votre région (${String(user?.region || '')}).`
          });
          return;
        }
      }

      if (isSectorAgent && form.departement) {
        const normalizedFormDep = String(form.departement || '').toLowerCase().trim();
        const normalizedUserDep = String(user?.departement || (user as any)?.zone || '').toLowerCase().trim();
        console.log('[Add] Comparaison département:', { form: normalizedFormDep, user: normalizedUserDep });

        if (normalizedFormDep !== normalizedUserDep) {
          console.log('[Add] ❌ Département non autorisé');
          setScopeDialog({
            open: true,
            title: 'Accès non autorisé',
            message: `Vous n'êtes pas autorisé à ajouter une zone hors de votre département (${String(user?.departement || (user as any)?.zone || '')}).`
          });
          return;
        }
      }

      console.log('Form coordinates:', form.coordinates);

      let geometry: any = null;
      try {
        geometry = coordinatesToGeoJSON(form.coordinates, form.coordinateSystem);
        console.log('Generated geometry:', geometry);
      } catch (error: any) {
        console.error('Geometry conversion error:', error);
        toast({ title: 'Validation', description: error.message || 'Coordonnées invalides' });
        return;
      }

      // Calculer le centroïde
      const centroid = calculateCentroid(form.coordinates, form.coordinateSystem);
      console.log('Calculated centroid:', centroid);

      // Utiliser FormData pour cohérence avec l'édition
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('type', form.type);
      formData.append('color', getZoneTypeColor(form.type));
      // Verrouillage côté envoi: forcer région/département selon le rôle
      const regionToUse = isRegionalAgent ? String(user?.region || '') : (form.region || '');
      const depToUse = isSectorAgent ? String(user?.departement || '') : (form.departement || '');
      if (regionToUse) formData.append('region', regionToUse);
      if (depToUse) formData.append('departement', depToUse);
      formData.append('geometry', JSON.stringify(geometry));
      formData.append('centroid_lat', centroid.lat.toString());
      formData.append('centroid_lon', centroid.lon.toString());

      console.log('Sending FormData with centroid:', {
        centroid_lat: centroid.lat.toString(),
        centroid_lon: centroid.lon.toString()
      });

      const response = await apiRequest<any>('POST', '/api/zones', formData);
      console.log('Server response:', response);
      if (!response?.ok) {
        const msg = String((response as any)?.error || 'Échec de création');
        if (msg.toLowerCase().includes('autorisé') || msg.includes('403')) {
          setScopeDialog({ open: true, title: 'Accès non autorisé', message: msg });
        } else {
          toast({ title: 'Erreur', description: msg });
        }
        return;
      }

      toast({ title: 'Succès', description: 'Zone créée avec succès' });
      // Rester ouvert et VIDER complètement le modal pour un nouvel enregistrement cohérent
      setForm({
        name: '',
        type: getDefaultZoneTypeKey(),
        region: '',
        departement: '',
        coordinateSystem: form.coordinateSystem, // préserver le système sélectionné (geographic/utm)
        coordinates: []
      });
      setCoordsFilePreview(null);
      setCoordinateSystemLocked(false);
      setCoordsDerived({ pointCount: 0, centroid: null, geometryType: 'none' });
      setUploadedShapefiles({ shp: null, shx: null, dbf: null, prj: null });
      setLocationLocked(false);
      await loadZones(true);
    } catch (e: any) {
      console.error('Submit error:', e);
      // Si erreur 403 (périmètre non autorisé), afficher le Dialog informatif
      if (e?.status === 403 || e?.message?.includes('autorisé')) {
        setScopeDialog({
          open: true,
          title: 'Accès non autorisé',
          message: e?.message || 'Vous n\'êtes pas autorisé à effectuer cette action.'
        });
      } else {
        toast({ title: 'Erreur', description: e?.message || 'Échec de création' });
      }
    }
  };

  const onShowDetail = (zone: ZoneItem) => {
    setOpenDetailZoneId(zone.id);
  };

  const onEdit = (zone: ZoneItem) => {
    // Garde d'accès: empêcher l'édition si non autorisé
    if (!canEditZone(zone)) {
      toast({ title: 'Accès refusé', description: "Vous n'êtes pas autorisé à modifier cette zone." });
      return;
    }
    setEditingZone(zone);
    setEditForm({
      id: zone.id,
      name: zone.name || "",
      type: zone.type || "zic",
      status: zone.status || "active",
      responsible_name: zone.responsible_name || "",
      responsible_phone: zone.responsible_phone || "",
      responsible_email: zone.responsible_email || "",
      responsible_photo: null,
      attachments: [],
      notes: zone.notes || "",
      guides_count: zone.guides_count?.toString() || "",
      trackers_count: zone.trackers_count?.toString() || "",
      region: zone.region || "",
      departement: zone.departement || "",
      commune: zone.commune || "",
      arrondissement: zone.arrondissement || "",
    });
    setOpenEdit(true);
  };

  const onSubmitEdit = async () => {
    try {
      // Utiliser FormData pour supporter les fichiers
      const formData = new FormData();
      formData.append('name', editForm.name);
      formData.append('type', editForm.type);
      formData.append('status', editForm.status);
      formData.append('color', getZoneTypeColor(editForm.type));

      if (editForm.responsible_name) formData.append('responsible_name', editForm.responsible_name);
      if (editForm.responsible_phone) formData.append('responsible_phone', editForm.responsible_phone);
      if (editForm.responsible_email) formData.append('responsible_email', editForm.responsible_email);
      if (editForm.notes) formData.append('notes', editForm.notes);
      if (editForm.guides_count) formData.append('guides_count', editForm.guides_count);
      if (editForm.trackers_count) formData.append('trackers_count', editForm.trackers_count);
      // Verrouillage côté envoi: forcer région/département selon le rôle
      const regionToUseEdit = isRegionalAgent ? String(user?.region || '') : (editForm.region || '');
      const depToUseEdit = isSectorAgent ? String(user?.departement || '') : (editForm.departement || '');
      if (regionToUseEdit) formData.append('region', regionToUseEdit);
      if (depToUseEdit) formData.append('departement', depToUseEdit);
      if (editForm.commune) formData.append('commune', editForm.commune);
      if (editForm.arrondissement) formData.append('arrondissement', editForm.arrondissement);

      // Ajouter la photo du responsable si présente
      if (editForm.responsible_photo) {
        formData.append('responsible_photo', editForm.responsible_photo);
      }

      // Ajouter les pièces jointes si présentes
      editForm.attachments.forEach((file, index) => {
        formData.append(`attachment_${index}`, file);
      });

      const resp = await apiRequest<any>('PUT', `/api/zones/${editForm.id}`, formData);
      if (!resp?.ok) {
        const msg = String((resp as any)?.error || 'Échec de mise à jour');
        if (msg.toLowerCase().includes('autorisé') || msg.includes('403')) {
          setScopeDialog({ open: true, title: 'Accès non autorisé', message: msg });
        } else {
          toast({ title: 'Erreur', description: msg });
        }
        return;
      }
      toast({ title: 'Succès', description: 'Zone mise à jour avec succès' });
      setOpenEdit(false);
      setEditingZone(null);
      loadZones(true);
    } catch (e: any) {
      console.error(e);
      // Si erreur 403 (périmètre non autorisé), afficher le Dialog informatif
      if (e?.status === 403 || e?.message?.includes('autorisé')) {
        setScopeDialog({
          open: true,
          title: 'Accès non autorisé',
          message: e?.message || 'Vous n\'êtes pas autorisé à effectuer cette action.'
        });
      } else {
        toast({ title: 'Erreur', description: e?.message || 'Échec de mise à jour' });
      }
    }
  };

  const onDelete = async (id: number) => {
    try {
      console.log('🗺️ Suppression de zone avec gestion des couches de carte:', id);

      // 1. Supprimer la zone du backend
      const response = await apiRequest('DELETE', `/api/zones/${id}`);

      if (!response.ok) {
        throw new Error('Échec de la suppression de la zone');
      }

      // 2. Supprimer la couche de la carte (si elle existe)
      await removeZoneFromMap(id);

      // 3. Invalider le cache persistant et mettre à jour l'UI immédiatement
      try { window.localStorage.removeItem(ZONES_CACHE_KEY); } catch {}
      setZones(prev => prev.filter(z => z.id !== id));
      // 4. Forcer un rechargement depuis l'API pour garantir la cohérence
      await loadZones(true);

      toast({
        title: '✅ Succès',
        description: 'Zone supprimée avec succès'
      });

    } catch (e: any) {
      console.error('❌ Erreur lors de la suppression de zone:', e);
      toast({
        title: '❌ Erreur',
        description: e?.message || 'Impossible de supprimer la zone'
      });
    }
  };

  // Statistiques pour le header (sur les zones filtrées visibles)
  const stats = useMemo(() => {
    const totalZones = filteredZones.length;
    const activeZones = filteredZones.filter(z => z.status === 'active').length;
    const totalAreaHa = filteredZones.reduce((sum, zone) => {
      const ha = (zone as any).surface_ha;
      if (typeof ha === 'number' && !isNaN(ha)) return sum + ha;
      const km2 = zone.area_sq_km;
      return sum + (typeof km2 === 'number' ? km2 * 100.0 : 0);
    }, 0);
    const totalPersonnel = filteredZones.reduce((sum, zone) => sum + (zone.guides_count || 0) + (zone.trackers_count || 0), 0);
    return { totalZones, activeZones, totalAreaHa, totalPersonnel };
  }, [filteredZones]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      <div className="container mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Header avec titre et statistiques */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-slate-800 to-blue-700 bg-clip-text text-transparent">
              {headerTitle}
            </h1>
            <p className="text-sm sm:text-lg text-slate-600 max-w-2xl">
              {headerSubtitle}
            </p>
            {!isRegionalAgent && !isSectorAgent && (
              <div className="p-3 pl-3.5 bg-blue-50 border border-blue-200 rounded-lg inline-flex items-center gap-2 max-w-3xl">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                <p className="text-sm text-blue-800">Les zones d'intérêt (ZIC) sont des zones délimitées.</p>
              </div>
            )}
          </div>

          {/* Cartes de statistiques */}
          <div className="grid flex-1 gap-4 w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalZones}</p>
                  <p className="text-sm text-slate-600">Zones totales</p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-xl">
                  <BarChart3 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.activeZones}</p>
                  <p className="text-sm text-slate-600">Zones actives</p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalPersonnel}</p>
                  <p className="text-sm text-slate-600">Personnel</p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-xl">
                  <svg
                    className="h-5 w-5 text-purple-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 3 18 5 21 16 12 21 3 14 4 6 6 3" />
                    <circle cx="6" cy="3" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="18" cy="5" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="21" cy="16" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="21" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="3" cy="14" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalAreaHa.toFixed(0)}</p>
                  <p className="text-sm text-slate-600">ha</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Carte d'information principale supprimée pour optimiser l'espace dans l'entête */}

        {/* Barre de recherche et actions */}
        <div className="flex flex-col gap-3 lg:gap-4">
          {/* Ligne 1: affichage + filtre type + recherche + exports */}
          <div className="flex items-center gap-3 w-full">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white/70 backdrop-blur">
                <Button
                  type="button"
                  size="sm"
                  variant={displayMode === 'cards' ? 'default' : 'outline'}
                  className={`rounded-none ${displayMode === 'cards' ? '' : 'bg-white'}`}
                  onClick={() => setDisplayMode('cards')}
                >
                  Cartes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={displayMode === 'list' ? 'default' : 'outline'}
                  className={`rounded-none border-l ${displayMode === 'list' ? '' : 'bg-white'}`}
                  onClick={() => setDisplayMode('list')}
                >
                  Liste
                </Button>
              </div>
            </div>

            {/* Filtre par type */}
            <div className="w-48">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="rounded-lg h-10 bg-white/80 backdrop-blur-sm">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {getZoneTypeOptions().map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full max-w-[420px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                placeholder="Rechercher une région, une zone de chasse..."
                className="pl-10 h-10 rounded-xl border-slate-300 bg-white/80 backdrop-blur-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => setOpenAdd(true)} className="h-10 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle Zone
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={exportZonesToCSV} className="rounded-lg">
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportZonesToPDF} className="rounded-lg">
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </div>

          {/* Ligne 2: actions */}
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">

          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <Dialog
              open={openAdd}
              onOpenChange={(open) => {
                setOpenAdd(open);
                if (open) {
                  setOpenImport(false);
                  setOpenEdit(false);
                  setOpenDetailZoneId(null);
                  setOpenAttachmentsZoneId(null);
                  // Si aucune coordonnée n'est saisie/importée, ne pas afficher d'éléments détectés persistés
                  if (!form?.coordinates || form.coordinates.length === 0) {
                    setForm(prev => ({ ...prev, region: '', departement: '' }));
                    setCoordsDerived({ pointCount: 0, centroid: null, geometryType: 'none' });
                    setCoordinateSystemLocked(false);
                    setCoordsFilePreview(null);
                  }
                }
              }}
            >
              <DialogContent className="max-w-3xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col" aria-describedby="dialog-description">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle className="text-xl font-bold">Nouvelle Zone de Chasse</DialogTitle>
                  <DialogDescription id="dialog-description" className="text-slate-600">
                    Créez une nouvelle zone de chasse avec géométrie précise
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2 overflow-y-auto flex-1 px-1">
                  <div>
                    <Label className="text-slate-700 font-medium">Nom de la zone</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={`mt-1.5 rounded-lg border-2 border-green-700 bg-yellow-50 focus:border-green-800 focus:ring-2 focus:ring-green-200 text-[14px] ${form.name ? 'font-semibold text-slate-900' : ''}`}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700 font-medium">Type de zone</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger className="mt-1.5 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getZoneTypeOptions().map(type => (
                          <SelectItem key={type.key} value={type.key}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-slate-700 font-medium">Système de coordonnées</Label>
                    <Select value={form.coordinateSystem} onValueChange={(v) => setForm({ ...form, coordinateSystem: v })}>
                      <SelectTrigger className="mt-1.5 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geographic">Géographiques (Latitude/Longitude)</SelectItem>
                        <SelectItem value="utm">WGS 84 / UTM zone 28N</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-slate-700 font-medium mb-3 block">Coordonnées du Polygone</Label>

                    <Tabs defaultValue="shapefile" className="w-full">
                      <TabsList className="grid w-full grid-cols-3 mb-4">
                        <TabsTrigger value="csv">Importer CSV</TabsTrigger>
                        <TabsTrigger value="shapefile">Importer Shapefile</TabsTrigger>
                        <TabsTrigger value="manual">Saisie manuelle</TabsTrigger>
                      </TabsList>

                      {/* Onglet CSV */}
                      <TabsContent value="csv" className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm text-blue-800">
                            <span className="font-semibold">📁 Format CSV :</span> Importez un fichier CSV avec colonnes Latitude/Longitude ou Easting/Northing.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="excel-coords-input"
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={async (e) => {
                              const inputEl = e.currentTarget;
                              const f = inputEl.files?.[0];
                              await onExcelFileChange(f);
                              try { inputEl.value = ''; } catch {}
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 rounded-lg"
                            onClick={() => document.getElementById('excel-coords-input')?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Sélectionner un fichier CSV
                          </Button>
                          {form.coordinates.length > 0 && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setForm(prev => ({ ...prev, coordinates: [], region: '', departement: '' }));
                                setLocationLocked(false);
                                setCoordsFilePreview(null);
                                toast({ title: 'Coordonnées effacées', description: 'Toutes les coordonnées ont été supprimées' });
                              }}
                              className="rounded-lg"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Effacer
                            </Button>
                          )}
                        </div>
                      </TabsContent>

                      {/* Onglet Shapefile */}
                      <TabsContent value="shapefile" className="space-y-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-sm text-green-800">
                            <span className="font-semibold">📁 Format Shapefile :</span> Téléversez un fichier .shp avec ses fichiers associés (.shx, .dbf, .prj).
                          </p>
                        </div>

                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 transition-colors">
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-3 bg-blue-100 rounded-full">
                              <Upload className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-medium text-gray-700">Glissez-déposez vos fichiers shapefile ici</p>
                              <p className="text-xs text-gray-500 mt-1">ou cliquez pour parcourir</p>
                            </div>
                            <Input
                              type="file"
                              accept=".shp,.shx,.dbf,.prj"
                              multiple
                              className="hidden"
                              id="shapefile-upload-zone"
                              onChange={(e) => {
                                const files = e.target.files;
                                if (files) {
                                  const newFiles = { ...uploadedShapefiles };
                                  Array.from(files).forEach(file => {
                                    const ext = file.name.split('.').pop()?.toLowerCase();
                                    if (ext === 'shp') newFiles.shp = file;
                                    else if (ext === 'shx') newFiles.shx = file;
                                    else if (ext === 'dbf') newFiles.dbf = file;
                                    else if (ext === 'prj') newFiles.prj = file;
                                  });
                                  setUploadedShapefiles(newFiles);
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => document.getElementById('shapefile-upload-zone')?.click()}
                            >
                              Parcourir les fichiers
                            </Button>
                          </div>
                        </div>

                        {/* Checklist des fichiers shapefile */}
                        {(uploadedShapefiles.shp || uploadedShapefiles.shx || uploadedShapefiles.dbf || uploadedShapefiles.prj) && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                            <p className="text-sm font-semibold text-gray-700 mb-3">📋 Fichiers détectés :</p>
                            <div className="grid grid-cols-2 gap-2">
                              {/* Fichier .shp */}
                              <div className="flex items-center gap-2">
                                {uploadedShapefiles.shp ? (
                                  <div className="flex items-center gap-2 text-green-600">
                                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                      <span className="text-xs">✓</span>
                                    </div>
                                    <span className="text-sm font-medium">.shp</span>
                                    <span className="text-xs text-gray-500">({uploadedShapefiles.shp.name})</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-red-600">
                                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                      <span className="text-xs">✗</span>
                                    </div>
                                    <span className="text-sm font-medium">.shp (requis)</span>
                                  </div>
                                )}
                              </div>

                              {/* Fichier .shx */}
                              <div className="flex items-center gap-2">
                                {uploadedShapefiles.shx ? (
                                  <div className="flex items-center gap-2 text-green-600">
                                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                      <span className="text-xs">✓</span>
                                    </div>
                                    <span className="text-sm font-medium">.shx</span>
                                    <span className="text-xs text-gray-500">({uploadedShapefiles.shx.name})</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-red-600">
                                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                      <span className="text-xs">✗</span>
                                    </div>
                                    <span className="text-sm font-medium">.shx (requis)</span>
                                  </div>
                                )}
                              </div>

                              {/* Fichier .dbf */}
                              <div className="flex items-center gap-2">
                                {uploadedShapefiles.dbf ? (
                                  <div className="flex items-center gap-2 text-green-600">
                                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                      <span className="text-xs">✓</span>
                                    </div>
                                    <span className="text-sm font-medium">.dbf</span>
                                    <span className="text-xs text-gray-500">({uploadedShapefiles.dbf.name})</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-red-600">
                                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                      <span className="text-xs">✗</span>
                                    </div>
                                    <span className="text-sm font-medium">.dbf (requis)</span>
                                  </div>
                                )}
                              </div>

                              {/* Fichier .prj */}
                              <div className="flex items-center gap-2">
                                {uploadedShapefiles.prj ? (
                                  <div className="flex items-center gap-2 text-green-600">
                                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                      <span className="text-xs">✓</span>
                                    </div>
                                    <span className="text-sm font-medium">.prj</span>
                                    <span className="text-xs text-gray-500">({uploadedShapefiles.prj.name})</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-yellow-600">
                                    <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
                                      <span className="text-xs">!</span>
                                    </div>
                                    <span className="text-sm font-medium">.prj (optionnel)</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Validation des fichiers requis */}
                            {uploadedShapefiles.shp && uploadedShapefiles.shx && uploadedShapefiles.dbf ? (
                              <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                                ✓ Tous les fichiers requis sont présents
                              </div>
                            ) : (
                              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                ⚠️ Fichiers manquants : {!uploadedShapefiles.shp && '.shp '}{!uploadedShapefiles.shx && '.shx '}{!uploadedShapefiles.dbf && '.dbf'}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message d'information sur l'import */}
                        {(uploadedShapefiles.shp && uploadedShapefiles.shx && uploadedShapefiles.dbf) && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-800">
                              <span className="font-semibold">ℹ️ Prêt à importer :</span> Cliquez sur "Importer le Shapefile" en bas du formulaire pour traiter les fichiers.
                            </p>
                          </div>
                        )}
                      </TabsContent>

                      {/* Onglet Saisie manuelle */}
                      <TabsContent value="manual" className="space-y-3">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Button type="button" variant="outline" size="sm" onClick={addCoordinate} className="rounded-lg">
                            <Plus className="h-3 w-3 mr-1" />
                            Ajouter un point
                          </Button>
                          {form.coordinates.length > 0 && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setForm(prev => ({ ...prev, coordinates: [], region: '', departement: '' }));
                                setLocationLocked(false);
                                toast({ title: 'Coordonnées effacées', description: 'Toutes les coordonnées ont été supprimées' });
                              }}
                              className="rounded-lg"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Effacer tout
                            </Button>
                          )}
                        </div>
                    {/* Aperçu CSV désactivé à la demande de l'utilisateur */}
                    {form.coordinates.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-300 rounded-lg p-3 bg-slate-50/50">
                        {form.coordinates.map((coord, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                          <span className="text-sm font-medium text-slate-600 w-12">P{index + 1}:</span>
                          {form.coordinateSystem === "geographic" ? (
                            <>
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500">Latitude (Y)</Label>
                                <Input
                                  type="number"
                                  step="any"
                                  placeholder="14.6928"
                                  value={form.coordinateSystem === "geographic"
                                    ? (coord as { latitude: string; longitude: string }).latitude
                                    : (coord as { easting: string; northing: string; utmZone: string }).easting || ""
                                  }
                                  onChange={(e) => updateCoordinate(index, form.coordinateSystem === "geographic" ? 'latitude' : 'easting', e.target.value)}
                                  className="h-8 rounded-md border-slate-300"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500">Longitude (X)</Label>
                                <Input
                                  type="number"
                                  step="any"
                                  placeholder="-17.4467"
                                  value={form.coordinateSystem === "geographic"
                                    ? (coord as { latitude: string; longitude: string }).longitude
                                    : (coord as { easting: string; northing: string; utmZone: string }).northing || ""
                                  }
                                  onChange={(e) => updateCoordinate(index, form.coordinateSystem === "geographic" ? 'longitude' : 'northing', e.target.value)}
                                  className="h-8 rounded-md border-slate-300"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500">Easting (X) — Sénégal</Label>
                                <Input
                                  type="number"
                                  step="any"
                                  placeholder="≈ 200000–800000"
                                  min={200000}
                                  max={800000}
                                  value={(coord as any).easting || ""}
                                  onChange={(e) => updateCoordinate(index, 'easting', e.target.value)}
                                  className="h-8 rounded-md border-slate-300"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500">Northing (Y) — Sénégal</Label>
                                <Input
                                  type="number"
                                  step="any"
                                  placeholder="≈ 1400000–1700000"
                                  min={1400000}
                                  max={1700000}
                                  value={(coord as any).northing || ""}
                                  onChange={(e) => updateCoordinate(index, 'northing', e.target.value)}
                                  className="h-8 rounded-md border-slate-300"
                                />
                              </div>
                              <div className="w-28">
                                <Label className="text-xs text-slate-500">Zone UTM</Label>
                                <Input
                                  placeholder="28N (fixe)"
                                  value={'28N'}
                                  readOnly
                                  disabled
                                  className="h-8 rounded-md border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed"
                                />
                              </div>
                            </>
                          )}
                          {form.coordinates.length > 1 && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeCoordinate(index)}
                              className="h-8 w-8 p-0 rounded-md"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          </div>
                        ))}
                      </div>
                    )}
                    {form.coordinates.length > 0 && (
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-xs text-slate-500">
                          {form.coordinateSystem === "geographic"
                            ? "Minimum 3 points requis pour former un polygone. Le polygone sera automatiquement fermé."
                            : "Saisissez les coordonnées UTM pour le Sénégal. Zone 28N fixe. Easting ≈ 200000–800000 • Northing ≈ 1400000–1700000."
                          }
                        </p>
                        {form.coordinates.some(coord => {
                          if (form.coordinateSystem === "geographic") {
                            const geoCoord = coord as { latitude: string; longitude: string };
                            return geoCoord.latitude && geoCoord.longitude;
                          } else {
                            const utmCoord = coord as { easting: string; northing: string; utmZone: string };
                            return utmCoord.easting && utmCoord.northing; // Zone UTM automatique (28N)
                          }
                        }) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-xs bg-blue-50 px-2 py-1 rounded border border-blue-200">
                              <span className="font-medium text-blue-700">Centre calculé:</span>
                              <span className="ml-1 text-blue-600">
                                {calculateCentroid(form.coordinates, form.coordinateSystem).lat.toFixed(6)}, {calculateCentroid(form.coordinates, form.coordinateSystem).lon.toFixed(6)}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const centroid = calculateCentroid(form.coordinates, form.coordinateSystem);
                                if (centroid) {
                                  toast({ title: 'Détection en cours...', description: `Recherche de la région pour ${centroid.lat.toFixed(6)}, ${centroid.lon.toFixed(6)}` });
                                  const detectedRegion = await findRegionFromPoint(centroid.lat, centroid.lon);
                                  if (detectedRegion) {
                                    setForm(prev => ({ ...prev, region: detectedRegion }));
                                    // Détecter aussi le département
                                    const dep = await findDepartementFromPoint(centroid.lat, centroid.lon);
                                    if (dep) {
                                      setForm(prev => ({ ...prev, departement: dep }));
                                      setLocationLocked(true);
                                      toast({ title: '✅ Localisation détectée', description: `${detectedRegion} • ${dep}` });
                                    } else {
                                      setLocationLocked(false);
                                      toast({ title: '✅ Région détectée', description: detectedRegion });
                                    }
                                  } else {
                                    toast({ title: '⚠️ Aucune région trouvée', description: 'Vérifiez les coordonnées ou la base de données', variant: 'destructive' });
                                  }
                                }
                              }}
                              className="rounded-lg text-xs h-7"
                            >
                              <MapPin className="h-3 w-3 mr-1" />
                              Détecter région
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                      </TabsContent>
                    </Tabs>
                  </div>
                  {/* Afficher région/département détectés automatiquement (lecture seule) */}
                  <div className="md:col-span-2">
                    {form.region && (form.coordinates?.length || 0) > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-blue-900">Région détectée: <span className="font-bold">{form.region}</span></p>
                        {form.departement && (
                          <p className="text-sm font-medium text-blue-900 mt-1">Département détecté: <span className="font-bold">{form.departement}</span></p>
                        )}
                        <p className="text-xs text-blue-700 mt-2">📍 Détection automatique basée sur les coordonnées saisies</p>
                      </div>
                    )}
                  </div>
                </div>
                {!canCreateGeometry && form.coordinates.length === 0 && (
                  <div className="pt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Ajoutez {form.coordinateSystem === 'geographic' ? 'au moins 1 point pour créer un point ou 3 points pour un polygone' : 'au moins 1 point UTM ou 3 points pour un polygone'}.
                  </div>
                )}
                <DialogFooter className="pt-4 flex-shrink-0 border-t bg-white sticky bottom-0 gap-2">
                  <Button variant="outline" onClick={() => {
                    setOpenAdd(false);
                    setUploadedShapefiles({ shp: null, shx: null, dbf: null, prj: null });
                  }} className="rounded-lg">Annuler</Button>

                  {/* Bouton conditionnel selon l'onglet actif */}
                  {(uploadedShapefiles.shp && uploadedShapefiles.shx && uploadedShapefiles.dbf) ? (
                    <Button
                      type="button"
                      disabled={uploadingShapefile}
                      onClick={async () => {
                        if (!uploadedShapefiles.shp || !uploadedShapefiles.shx || !uploadedShapefiles.dbf) {
                          toast({
                            title: "Fichiers manquants",
                            description: "Veuillez téléverser tous les fichiers requis (.shp, .shx, .dbf)",
                            variant: "destructive"
                          });
                          return;
                        }

                        if (!form.type) {
                          toast({
                            title: "Type de zone requis",
                            description: "Veuillez sélectionner le type de zone avant d'importer le shapefile",
                            variant: "destructive"
                          });
                          return;
                        }

                        setUploadingShapefile(true);
                        try {
                          const formData = new FormData();
                          formData.append('shp', uploadedShapefiles.shp);
                          formData.append('shx', uploadedShapefiles.shx);
                          formData.append('dbf', uploadedShapefiles.dbf);
                          if (uploadedShapefiles.prj) formData.append('prj', uploadedShapefiles.prj);
                          formData.append('zoneType', form.type);
                          formData.append('zoneName', form.name || 'Zone importée');

                          const response = await fetch('/api/zones/import-shapefile', {
                            method: 'POST',
                            body: formData,
                          });

                          if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.message || 'Erreur lors de l\'import du shapefile');
                          }

                          const result = await response.json();

                          console.log('[SHAPEFILE] Résultat reçu:', result);

                          // Le backend a déjà enregistré la zone dans protected_zones
                          toast({
                            title: "Succès",
                            description: result.message || `Zone créée avec succès (${result.coordinatesCount || 0} points)`
                          });

                          // Invalider le cache et réinitialiser complètement le formulaire d'ajout
                          try { window.localStorage.removeItem(ZONES_CACHE_KEY); } catch {}
                          setForm({
                            name: '',
                            type: getDefaultZoneTypeKey(),
                            region: '',
                            departement: '',
                            coordinateSystem: form.coordinateSystem,
                            coordinates: []
                          });
                          setCoordsFilePreview(null);
                          setCoordinateSystemLocked(false);
                          setCoordsDerived({ pointCount: 0, centroid: null, geometryType: 'none' });
                          setUploadedShapefiles({ shp: null, shx: null, dbf: null, prj: null });
                          setLocationLocked(false);

                          // Rester dans le modal pour enchaîner un nouvel enregistrement
                          await loadZones(true);
                          toast({ title: 'Prêt', description: 'Formulaire réinitialisé pour une nouvelle zone.' });

                          console.log('[SHAPEFILE] ✅ Zone créée et affichée sur la carte');

                        } catch (error: any) {
                          console.error('Erreur import shapefile:', error);
                          toast({
                            title: "Erreur",
                            description: error?.message || "Impossible d'importer le shapefile",
                            variant: "destructive"
                          });
                        } finally {
                          setUploadingShapefile(false);
                        }
                      }}
                      className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                    >
                      {uploadingShapefile ? (
                        <>
                          <Upload className="h-4 w-4 mr-2 animate-spin" />
                          Traitement en cours...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Importer le Shapefile
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={onSubmitAdd}
                      disabled={!canCreateGeometry}
                      className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Enregistrer
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={openImport}
              onOpenChange={(open) => {
                setOpenImport(open);
                if (open) {
                  setOpenAdd(false);
                  setOpenEdit(false);
                  setOpenDetailZoneId(null);
                  setOpenAttachmentsZoneId(null);
                }
              }}
            >
              {/* Bouton Importer CSV (supprimé à la demande) */}
              <DialogContent className="max-w-2xl rounded-2xl" aria-describedby="import-dialog-description">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Importer une Zone</DialogTitle>
                  <DialogDescription id="import-dialog-description" className="text-slate-600">
                    Importez une zone de chasse depuis un fichier CSV avec coordonnées
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                  <div>
                    <Label className="text-slate-700 font-medium">Nom de la zone</Label>
                    <Input
                      value={importForm.name}
                      onChange={(e) => setImportForm({ ...importForm, name: e.target.value })}
                      placeholder="ZIC de Test"
                      className="mt-1.5 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-700 font-medium">Type de zone</Label>
                    <Select value={importForm.type} onValueChange={(v) => setImportForm({ ...importForm, type: v as any })}>
                      <SelectTrigger className="mt-1.5 rounded-lg"><SelectValue placeholder="Choisir le type" /></SelectTrigger>
                      <SelectContent>
                        {getZoneTypeOptions().map(type => (
                          <SelectItem key={type.key} value={type.key}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Afficher région/département détectés automatiquement (lecture seule) */}
                  {importForm.region && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-900">Région détectée: <span className="font-bold">{importForm.region}</span></p>
                      {importForm.departement && (
                        <p className="text-sm font-medium text-blue-900 mt-1">Département détecté: <span className="font-bold">{importForm.departement}</span></p>
                      )}
                      <p className="text-xs text-blue-700 mt-2">📍 Détection automatique basée sur les coordonnées du fichier CSV</p>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <Label className="text-slate-700 font-medium">Fichier CSV</Label>
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => setImportForm({ ...importForm, file: e.target.files?.[0] || null })}
                      className="mt-1.5 rounded-lg"
                    />
                    <p className="text-xs text-slate-500 mt-1">Colonnes supportées: lat,lon | latitude,longitude | coord="lat,lon" | easting,northing,zone (UTM ex: 28N). Séparateur ";" ou ",".</p>
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="outline" onClick={() => setOpenImport(false)} className="rounded-lg">Annuler</Button>
                  <Button onClick={onSubmitImport} className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700">Importer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {/* Fermeture du conteneur principal de la barre d'actions (ouvert ligne ~1612) */}
        </div>

        {/* Contenu principal */}
        <Tabs defaultValue="hunting-zones" value={activeTab} onValueChange={setActiveTab} className="space-y-6">

          <TabsContent value="hunting-zones" className="space-y-6">
            {/* Grille des zones (mode cartes) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {(loading || loadingConfig) && (
                <div className="col-span-full text-center text-slate-500 py-12">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto"></div>
                  </div>
                </div>
              )}
              {error && (
                <div className="col-span-full text-center text-red-600 bg-red-50 border border-red-200 rounded-2xl p-6">
                  {error}
                </div>
              )}
              {!loading && displayMode === 'cards' && paginatedZones.map((zone) => (
                <Card key={zone.id} className="border-0 shadow-md hover:shadow-lg transition-all duration-200 bg-white/80 backdrop-blur-sm overflow-hidden group">
                  <CardHeader className="py-1 pb-1">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <CardTitle className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 group-hover:text-blue-700 transition-colors">
                          <span
                            className="inline-block w-3.5 h-3.5 rounded-full shadow-sm"
                            style={{ backgroundColor: zone.color || getZoneTypeColor(zone.type || '') }}
                          />
                          {zone.name}
                        </CardTitle>
                        <div className="text-[10px] text-slate-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-500" />
                            <span className="truncate">
                              {zone.region || 'Non défini'}{zone.departement ? ` • ${zone.departement}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={zone.status === "active" ? "default" : "secondary"}
                        className="shadow-sm text-[9px] py-0 px-1.5"
                      >
                        {getZoneStatusLabel(zone.status || 'active')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 pb-1.5">
                    <div className="text-[10px] space-y-1">
                      <div className="flex flex-wrap gap-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-700">Superficie:</span>
                          <span className="text-slate-600">
                            {Number(zone.area_sq_km || 0) > 0 ? `${Number(zone.area_sq_km).toFixed(2)} km²` : "N/A"}
                          </span>
                        </div>
                        {zone.guides_count && (
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-slate-500" />
                            <span className="text-slate-600">{zone.guides_count} guides</span>
                          </div>
                        )}
                      </div>
                      {zone.centroid_lat && zone.centroid_lon && (
                        <div className="flex items-center gap-1 text-[10px] bg-green-50 px-2 py-1 rounded border border-green-200">
                          <MapPin className="h-3 w-3 text-green-600" />
                          <span className="font-medium text-green-700">Centre:</span>
                          <span className="text-green-600 font-mono">
                            {Number(zone.centroid_lat).toFixed(4)}, {Number(zone.centroid_lon).toFixed(4)}
                          </span>
                        </div>
                      )}
                      {/* Notes masquées en mode compact pour réduire la hauteur */}
                    </div>
                    <div className="flex justify-end gap-1 pt-1">
                      <Button variant="outline" size="icon" onClick={() => onShowDetail(zone)} className="rounded-md border-slate-300 h-6 w-6">
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onEdit(zone)}
                        disabled={!canEditZone(zone)}
                        title={!canEditZone(zone) ? "Modification non autorisée pour votre rôle" : undefined}
                        className="rounded-md border-slate-300 h-6 w-6 disabled:opacity-50"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="destructive" size="icon" onClick={() => onDelete(zone.id)} className="rounded-md h-6 w-6">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}


              {/* Mode Liste: tableau compact */}
              {!loading && displayMode === 'list' && (
                <div className="col-span-full">
                  <div className="overflow-auto rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm">
                    <table className="min-w-[820px] w-full text-xs sm:text-sm">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th className="text-left px-3 sm:px-4 py-2">Nom</th>
                          <th className="text-left px-3 sm:px-4 py-2">Type</th>
                          <th className="text-left px-3 sm:px-4 py-2 hidden md:table-cell">Région</th>
                          <th className="text-left px-3 sm:px-4 py-2 hidden lg:table-cell">Département</th>
                          <th className="text-left px-3 sm:px-4 py-2 hidden lg:table-cell">Superficie</th>
                          <th className="text-left px-3 sm:px-4 py-2">Statut</th>
                          <th className="text-right px-3 sm:px-4 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {paginatedZones.map((zone) => (
                          <tr key={zone.id} className="hover:bg-slate-50">
                            <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: zone.color || getZoneTypeColor(zone.type || '') }} />
                                <span className="font-medium text-slate-800 text-xs sm:text-sm">{zone.name}</span>
                              </div>
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-slate-600">{getZoneTypeLabel(zone.type || '')}</td>
                            <td className="px-3 sm:px-4 py-2 text-slate-600 hidden md:table-cell">{zone.region || '—'}</td>
                            <td className="px-3 sm:px-4 py-2 text-slate-600 hidden lg:table-cell">{zone.departement || '—'}</td>
                            <td className="px-3 sm:px-4 py-2 text-slate-600 hidden lg:table-cell">{Number(zone.area_sq_km || 0) > 0 ? `${Number(zone.area_sq_km).toFixed(2)} km²` : 'N/A'}</td>
                            <td className="px-3 sm:px-4 py-2">
                              <Badge variant={zone.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                {getZoneStatusLabel(zone.status || 'active')}
                              </Badge>
                            </td>
                            <td className="px-3 sm:px-4 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => onShowDetail(zone)} className="rounded-lg border-slate-300 h-7 px-2">
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onEdit(zone)}
                                  disabled={!canEditZone(zone)}
                                  className="rounded-lg border-slate-300 disabled:opacity-50 h-7 px-2"
                                  title={!canEditZone(zone) ? "Modification non autorisée pour votre rôle" : undefined}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => onDelete(zone.id)} className="rounded-lg h-7 px-2">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Pagination */}
            {!loading && filteredZones.length > 0 && (
              <div className="p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm bg-white sticky bottom-0 z-[210] border-t rounded-b-lg shadow-sm pointer-events-auto">
                <div className="text-muted-foreground">
                  Affichage de {startIndex + 1} à {endIndex} sur {filteredZones.length} zones
                  {totalPages > 1 && (
                    <span className="ml-2 text-xs text-gray-500">(Page {currentPage} / {totalPages})</span>
                  )}
                </div>
                <div className="flex gap-2 sm:ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}

            {!loading && filteredZones.length === 0 && searchQuery && (
              <div className="text-center py-12">
                <div className="text-slate-400 mb-2">Aucune zone trouvée pour "{searchQuery}"</div>
                <Button variant="outline" onClick={() => setSearchQuery('')} className="rounded-lg">
                  Réinitialiser la recherche
                </Button>
              </div>
            )}

            {!loading && filteredZones.length === 0 && !searchQuery && (
              <div className="text-center py-12">
                <div className="text-slate-400 mb-4">Aucune zone de chasse enregistrée</div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Les dialogs restants (détail, édition, coordonnées, pièces jointes, aperçu) */}

        {/* Dialog informatif - Périmètre non autorisé */}
        <Dialog open={scopeDialog.open} onOpenChange={(open) => setScopeDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-red-100 rounded-full">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                {scopeDialog.title || "Information"}
              </DialogTitle>
              <DialogDescription className="text-slate-700 text-base pt-2">
                {scopeDialog.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => setScopeDialog(prev => ({ ...prev, open: false }))}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 w-full"
              >
                J'ai compris
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Détails de la Zone */}
        <Dialog
          open={!!openDetailZoneId}
          onOpenChange={(open) => {
            if (!open) setOpenDetailZoneId(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Détails de la Zone</DialogTitle>
            </DialogHeader>
            {openDetailZoneId && (() => {
              const zone = zones.find(z => z.id === openDetailZoneId);
              if (!zone) return null;

              return (
                <div className="space-y-6">
                  {/* En-tête avec informations principales */}
                  <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-6 border border-slate-200">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-6 h-6 rounded-full shadow-sm"
                          style={{ backgroundColor: zone.color || getZoneTypeColor(zone.type || '') }}
                        />
                        <h3 className="text-2xl font-bold text-slate-800">{zone.name}</h3>
                      </div>
                      <div className="flex gap-2">
                        {(zoneStatusesConfig.length > 0
                          ? zoneStatusesConfig.filter(s => s.isActive)
                          : defaultZoneStatuses
                        ).map((status) => (
                          <button
                            key={status.key}
                            onClick={async () => {
                              if (zone.status === status.key) return; // Ne rien faire si déjà sélectionné
                              try {
                                const formData = new FormData();
                                formData.append('name', zone.name);
                                formData.append('type', zone.type);
                                formData.append('status', status.key);
                                formData.append('color', zone.color || getZoneTypeColor(zone.type || ''));

                                const response = await apiRequest('PUT', `/api/zones/${zone.id}`, formData);
                                if (response?.ok) {
                                  // Mettre à jour l'état local
                                  setZones(prevZones =>
                                    prevZones.map(z =>
                                      z.id === zone.id
                                        ? { ...z, status: status.key }
                                        : z
                                    )
                                  );
                                  toast({ title: 'Succès', description: 'Statut mis à jour' });
                                } else {
                                  toast({ title: 'Erreur', description: 'Impossible de mettre à jour le statut' });
                                }
                              } catch (error) {
                                toast({ title: 'Erreur', description: 'Impossible de mettre à jour le statut' });
                              }
                            }}
                            className={`
                              px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border
                              ${zone.status === status.key
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                              }
                            `}
                          >
                            {status.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-600">
                          {(zone.region || 'Non défini')}
                          {zone.departement && ` • ${zone.departement}`}
                        </span>
                      </div>
                      {zone.area_sq_km && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700">Superficie:</span>
                          <span className="text-slate-600">{Number(zone.area_sq_km).toFixed(2)} km²</span>
                        </div>
                      )}
                      {zone.guides_count && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-600">{zone.guides_count} guides</span>
                        </div>
                      )}
                      {zone.trackers_count && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-600">{zone.trackers_count} pisteurs</span>
                        </div>
                      )}
                    </div>

                    {zone.centroid_lat && zone.centroid_lon && (
                      <div className="mt-4 flex items-center gap-2 text-sm bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                        <MapPin className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-700">Centre géographique:</span>
                        <span className="text-green-600 font-mono">
                          {Number(zone.centroid_lat).toFixed(6)}, {Number(zone.centroid_lon).toFixed(6)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Responsable */}
                  {(zone.responsible_name || zone.responsible_phone || zone.responsible_email) && (
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-slate-600" />
                        Responsable de Zone
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {zone.responsible_name && (
                          <div>
                            <span className="font-medium text-slate-700">Nom:</span>
                            <p className="text-slate-600">{zone.responsible_name}</p>
                          </div>
                        )}
                        {zone.responsible_phone && (
                          <div>
                            <span className="font-medium text-slate-700">Téléphone:</span>
                            <p className="text-slate-600">{zone.responsible_phone}</p>
                          </div>
                        )}
                        {zone.responsible_email && (
                          <div>
                            <span className="font-medium text-slate-700">Email:</span>
                            <p className="text-slate-600">{zone.responsible_email}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {zone.notes && (
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-4">Notes et Observations</h4>
                      <p className="text-slate-600 leading-relaxed">{zone.notes}</p>
                    </div>
                  )}

                  {/* Pièces jointes */}
                  {zone.attachments && zone.attachments.length > 0 && (
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-4">Pièces Jointes</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {zone.attachments.map((att, index) => (
                          <div key={index} className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-slate-700 truncate">{att.name || 'Document'}</span>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAttachmentPreview(att)}
                                  className="h-8 px-2 text-xs"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteExistingAttachment(att.url)}
                                  className="h-8 px-2 text-xs"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {att.mime && (
                              <p className="text-xs text-slate-500">{att.mime}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Métadonnées */}
                  <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                    <h4 className="font-semibold text-slate-800 mb-4">Informations Système</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-slate-700">Type:</span>
                        <p className="text-slate-600">{getZoneTypeLabel(zone.type || '')}</p>
                      </div>
                      {zone.created_by && (
                        <div>
                          <span className="font-medium text-slate-700">Créé par:</span>
                          <p className="text-slate-600">{zone.created_by}</p>
                        </div>
                      )}
                      {zone.created_at && (
                        <div>
                          <span className="font-medium text-slate-700">Créé le:</span>
                          <p className="text-slate-600">{new Date(zone.created_at).toLocaleDateString('fr-FR')}</p>
                        </div>
                      )}
                      {zone.updated_at && (
                        <div>
                          <span className="font-medium text-slate-700">Modifié le:</span>
                          <p className="text-slate-600">{new Date(zone.updated_at).toLocaleDateString('fr-FR')}</p>
                        </div>
                      )}
                      {zone.responsible_photo && (
                        <div className="md:col-span-2">
                          <span className="font-medium text-slate-700">Photo du responsable:</span>
                          <div className="mt-2">
                            <img
                              src={buildAttachmentUrl(zone.responsible_photo)}
                              alt="Photo du responsable"
                              className="w-24 h-24 object-cover rounded-lg border border-slate-300"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Dialog Édition de Zone */}
        <Dialog
          open={openEdit}
          onOpenChange={(open) => {
            setOpenEdit(open);
            if (!open) {
              setEditingZone(null);
              setAllowLocationEdit(false); // Réinitialiser le contrôle de localisation
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Modifier la Zone</DialogTitle>
              <DialogDescription className="text-slate-600">
                Modifiez les informations de la zone de chasse sélectionnée
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              {/* Colonne 1 - Informations de base */}
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-700 font-medium">Nom de la zone</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Nom de la zone"
                    className="mt-1.5 rounded-lg"
                  />
                </div>

                <div>
                  <Label className="text-slate-700 font-medium">Type de zone</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                    <SelectTrigger className="mt-1.5 rounded-lg"><SelectValue placeholder="Choisir le type" /></SelectTrigger>
                    <SelectContent>
                      {zoneTypesConfig.filter(t => t.isActive).length > 0
                        ? zoneTypesConfig.filter(t => t.isActive).map(type => (
                            <SelectItem key={type.key} value={type.key}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                                {type.label}
                              </div>
                            </SelectItem>
                          ))
                        : defaultZoneTypes.map(type => (
                            <SelectItem key={type.key} value={type.key}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                                {type.label}
                              </div>
                            </SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium">Statut</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger className="mt-1.5 rounded-lg"><SelectValue placeholder="Choisir le statut" /></SelectTrigger>
                    <SelectContent>
                      {zoneStatusesConfig.filter(s => s.isActive).length > 0
                        ? zoneStatusesConfig.filter(s => s.isActive).map(status => (
                            <SelectItem key={status.key} value={status.key}>
                              {status.label}
                            </SelectItem>
                          ))
                        : defaultZoneStatuses.map(status => (
                            <SelectItem key={status.key} value={status.key}>
                              {status.label}
                            </SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                </div>

                {/* Section Localisation avec contrôle de modification */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-700 font-medium">Localisation</Label>
                    {!allowLocationEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAllowLocationEdit(true)}
                        className="text-xs h-8 px-3"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Modifier
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAllowLocationEdit(false)}
                        className="text-xs h-8 px-3 border-green-200 text-green-600 hover:bg-green-50"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Valider
                      </Button>
                    )}
                  </div>

                  <div className={`transition-all duration-200 ${!allowLocationEdit ? 'opacity-60 pointer-events-none' : ''}`}>
                    <LocationSelector
                      selectedRegion={editForm.region}
                      selectedDepartement={editForm.departement}
                      selectedCommune={editForm.commune}
                      selectedArrondissement={editForm.arrondissement}
                      onRegionChange={(value) => setEditForm(prev => ({ ...prev, region: value, departement: '', commune: '', arrondissement: '' }))}
                      onDepartementChange={(value) => setEditForm(prev => ({ ...prev, departement: value, commune: '', arrondissement: '' }))}
                      onCommuneChange={(value) => setEditForm(prev => ({ ...prev, commune: value, arrondissement: '' }))}
                      onArrondissementChange={(value) => setEditForm(prev => ({ ...prev, arrondissement: value }))}
                      showCommune={true}
                      showArrondissement={true}
                      disabled={!allowLocationEdit}
                    />
                  </div>

                  {!allowLocationEdit && (
                    <p className="text-xs text-slate-500 italic">
                      La localisation est verrouillée. Cliquez sur "Modifier" pour la déverrouiller.
                    </p>
                  )}
                </div>
              </div>

              {/* Colonne 2 - Responsable et ressources */}
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h4 className="font-semibold text-slate-800 mb-4">Responsable de Zone</h4>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-slate-700 text-sm">Nom du responsable</Label>
                      <Input
                        value={editForm.responsible_name}
                        onChange={(e) => setEditForm({ ...editForm, responsible_name: e.target.value })}
                        placeholder="Nom complet"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 text-sm">Téléphone</Label>
                      <Input
                        value={editForm.responsible_phone}
                        onChange={(e) => setEditForm({ ...editForm, responsible_phone: e.target.value })}
                        placeholder="+221 XX XXX XX XX"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 text-sm">Email</Label>
                      <Input
                        value={editForm.responsible_email}
                        onChange={(e) => setEditForm({ ...editForm, responsible_email: e.target.value })}
                        placeholder="responsable@example.com"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 text-sm">Photo du responsable</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setEditForm({ ...editForm, responsible_photo: file });
                          }
                        }}
                        className="mt-1 rounded-md"
                      />
                      {editForm.responsible_photo && (
                        <p className="text-xs text-slate-500 mt-1">
                          Fichier sélectionné: {(editForm.responsible_photo as File).name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h4 className="font-semibold text-slate-800 mb-4">Ressources Humaines</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-700 text-sm">Nombre de guides</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editForm.guides_count}
                        onChange={(e) => setEditForm({ ...editForm, guides_count: e.target.value })}
                        placeholder="0"
                        className="mt-1 rounded-md"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700 text-sm">Nombre de pisteurs</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editForm.trackers_count}
                        onChange={(e) => setEditForm({ ...editForm, trackers_count: e.target.value })}
                        placeholder="0"
                        className="mt-1 rounded-md"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium">Notes et observations</Label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Observations sur la zone, particularités, etc."
                    className="mt-1.5 w-full h-24 p-3 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Boutons d'action */}
            <DialogFooter className="pt-6 border-t border-slate-200">
              <div className="flex justify-between w-full">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setOpenAttachmentsZoneId(editingZone?.id || null)}
                    className="rounded-lg"
                  >
                    Pièces jointes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setOpenCoordinatesZoneId(editingZone?.id || null)}
                    className="rounded-lg"
                  >
                    Modifier coordonnées
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOpenEdit(false)} className="rounded-lg">
                    Annuler
                  </Button>
                  <Button onClick={onSubmitEdit} className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700">
                    Enregistrer
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Modification des Coordonnées */}
        <Dialog
          open={!!openCoordinatesZoneId}
          onOpenChange={(open) => {
            if (!open) {
              setOpenCoordinatesZoneId(null);
              setEditCoordinateSystemLocked(false); // déverrouiller en fermant la modale
            }
          }}
        >
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Modifier les Coordonnées</DialogTitle>
              <DialogDescription className="text-slate-600">
                Modifiez les coordonnées géographiques de la zone
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-slate-700 font-medium">Système de coordonnées</Label>
                <Select value={editCoordinateSystem} onValueChange={(v) => setEditCoordinateSystem(v as any)} disabled={editCoordinateSystemLocked}>
                  <SelectTrigger className="mt-1.5 rounded-lg disabled:opacity-60">
                    <SelectValue placeholder="Choisir le système de coordonnées" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geographic">Géographiques (Latitude/Longitude)</SelectItem>
                    <SelectItem value="utm">WGS 84 / UTM zone 28N</SelectItem>
                  </SelectContent>
                </Select>
                {editCoordinateSystemLocked && (
                  <p className="mt-1 text-xs text-slate-500">Système verrouillé après saisie: effacez les points ou fermez la fenêtre pour changer.</p>
                )}
              </div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-slate-700 font-medium">Coordonnées du Polygone</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditCoordinateSystemLocked(true); addEditCoordinate(); }} className="rounded-lg">
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter un point
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-300 rounded-lg p-3 bg-slate-50/50">
                {editCoordinates.map((coord, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-sm font-medium text-slate-600 w-12">P{index + 1}:</span>
                    {editCoordinateSystem === 'geographic' ? (
                      <>
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">Latitude (Y)</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="14.6928"
                            value={(coord as any).latitude || ''}
                            onChange={(e) => updateEditCoordinate(index, 'latitude', e.target.value)}
                            className="h-8 rounded-md border-slate-300"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">Longitude (X)</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="-17.4467"
                            value={(coord as any).longitude || ''}
                            onChange={(e) => updateEditCoordinate(index, 'longitude', e.target.value)}
                            className="h-8 rounded-md border-slate-300"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">Easting (X) — Sénégal</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="≈ 200000–800000"
                            min={200000}
                            max={800000}
                            value={(coord as any).easting || ''}
                            onChange={(e) => updateEditCoordinate(index, 'easting', e.target.value)}
                            className="h-8 rounded-md border-slate-300"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">Northing (Y) — Sénégal</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="≈ 1400000–1700000"
                            min={1400000}
                            max={1700000}
                            value={(coord as any).northing || ''}
                            onChange={(e) => updateEditCoordinate(index, 'northing', e.target.value)}
                            className="h-8 rounded-md border-slate-300"
                          />
                        </div>
                        <div className="w-28">
                          <Label className="text-xs text-slate-500">Zone UTM</Label>
                          <Input
                            placeholder="28N (fixe)"
                            value={'28N'}
                            readOnly
                            disabled
                            className="h-8 rounded-md border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed"
                          />
                        </div>
                      </>
                    )}
                    {editCoordinates.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeEditCoordinate(index)}
                        className="h-8 w-8 p-0 rounded-md"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-500">
                  Minimum 3 points requis pour former un polygone. Le polygone sera automatiquement fermé.
                </p>
                {(editCoordinateSystem === 'geographic'
                  ? editCoordinates.some((coord: any) => (coord.latitude || '').trim() && (coord.longitude || '').trim())
                  : (editCoordinates as any[]).some((coord: any) => (coord.easting || '').toString() && (coord.northing || '').toString())
                 ) && (
                  <div className="text-xs bg-blue-50 px-2 py-1 rounded border border-blue-200">
                    <span className="font-medium text-blue-700">Centre calculé:</span>
                    <span className="ml-1 text-blue-600">
                      {calculateCentroid(editCoordinates as any, editCoordinateSystem).lat.toFixed(6)}, {calculateCentroid(editCoordinates as any, editCoordinateSystem).lon.toFixed(6)}
                    </span>
                  </div>
                )}
              </div>
              {editCoordinateSystem === 'utm' && (
                <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-2">
                  Indications UTM Sénégal:
                  <span className="ml-1">Zone typique 28N à 30N • Easting ≈ 200000–800000 • Northing ≈ 1400000–1700000.</span>
                </div>
              )}
            </div>
            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => setOpenCoordinatesZoneId(null)} className="rounded-lg">
                Annuler
              </Button>
              <Button onClick={async () => {
                try {
                  // Construire la géométrie depuis les coordonnées d'édition
                  const geometry = coordinatesToGeoJSON(editCoordinates as any, editCoordinateSystem);
                  const centroid = calculateCentroid(editCoordinates as any, editCoordinateSystem);
                  const zoneId = openCoordinatesZoneId!;
                  const zone = zones.find(z => z.id === zoneId);
                  const formData = new FormData();
                  if (zone) {
                    formData.append('name', zone.name);
                    formData.append('type', zone.type);
                    formData.append('status', zone.status || 'active');
                    formData.append('color', zone.color || getZoneTypeColor(zone.type));
                  }
                  formData.append('geometry', JSON.stringify(geometry));
                  formData.append('centroid_lat', String(centroid.lat));
                  formData.append('centroid_lon', String(centroid.lon));
                  await apiRequest('PUT', `/api/zones/${zoneId}`, formData);
                  await loadZones(true);
                  setOpenCoordinatesZoneId(null);
                  toast({ title: 'Succès', description: 'Coordonnées mises à jour' });
                } catch (e: any) {
                  console.error('Update coordinates error:', e);
                  toast({ title: 'Erreur', description: e?.message || 'Impossible de mettre à jour les coordonnées' });
                }
              }} className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700">
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Gestion des Pièces Jointes */}
        <Dialog
          open={!!openAttachmentsZoneId}
          onOpenChange={(open) => {
            if (!open) {
              setOpenAttachmentsZoneId(null);
              setNewAttachments([]);
              setDragActive(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Gestion des Pièces Jointes</DialogTitle>
              <DialogDescription className="text-slate-600">
                Gérez les documents et pièces jointes de la zone
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Zone d'upload avec drag & drop */}
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-600 mb-2">
                  {dragActive ? 'Déposez les fichiers ici' : 'Glissez-déposez vos fichiers ici'}
                </p>
                <p className="text-xs text-slate-500 mb-4">Formats supportés: PDF, images, documents (max 10MB)</p>
                <div className="flex gap-2 justify-center">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,image/*"
                    onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    Parcourir les fichiers
                  </Button>
                </div>
              </div>

              {/* Nouveaux fichiers à uploader */}
              {newAttachments.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">Nouveaux fichiers à ajouter</Label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {newAttachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                            <span className="text-blue-600 text-xs font-bold">
                              {file.type.startsWith('image/') ? 'IMG' : 'PDF'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{file.name}</p>
                            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeNewAttachment(index)}
                          className="h-8 w-8 p-0 rounded-md"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={uploadAttachments}
                      disabled={uploadingAttachments}
                      className="rounded-lg bg-gradient-to-r from-green-600 to-green-700"
                    >
                      {uploadingAttachments ? 'Upload en cours...' : `Uploader ${newAttachments.length} fichier(s)`}
                    </Button>
                  </div>
                </div>
              )}

              {/* Pièces jointes existantes */}
              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">
                  Pièces jointes existantes ({existingAttachments.length})
                </Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {existingAttachments.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p>Aucune pièce jointe pour cette zone</p>
                    </div>
                  ) : (
                    existingAttachments.map((att, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded flex items-center justify-center ${
                            att.mime?.startsWith('image/') ? 'bg-green-100' :
                            att.mime === 'application/pdf' ? 'bg-red-100' :
                            'bg-blue-100'
                          }`}>
                            <span className={`text-xs font-bold ${
                              att.mime?.startsWith('image/') ? 'text-green-600' :
                              att.mime === 'application/pdf' ? 'text-red-600' :
                              'text-blue-600'
                            }`}>
                              {att.mime?.startsWith('image/') ? 'IMG' :
                               att.mime === 'application/pdf' ? 'PDF' : 'DOC'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{att.name || 'Document sans nom'}</p>
                            <p className="text-xs text-slate-500">
                              {att.mime || 'Type inconnu'} • {new Date().toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAttachmentPreview(att)}
                            className="h-8 px-3"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteExistingAttachment(att.url)}
                            className="h-8 px-3"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setOpenAttachmentsZoneId(null);
                  setNewAttachments([]);
                  setDragActive(false);
                }}
                className="rounded-lg"
              >
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Aperçu des Pièces Jointes */}
        <Dialog
          open={!!previewAttachment}
          onOpenChange={(open) => {
            if (!open) setPreviewAttachment(null);
          }}
        >
          <DialogContent className="max-w-4xl max-h-[80vh] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {previewAttachment?.name || 'Aperçu du document'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              {previewAttachment && (
                <div className="w-full h-full min-h-[60vh] bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center">
                  {previewAttachment.mime?.startsWith('image/') ? (
                    <img
                      src={previewAttachment.url}
                      alt={previewAttachment.name || 'Image'}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : previewAttachment.mime === 'application/pdf' && !iframeError ? (
                    <iframe
                      src={previewAttachment.url}
                      className="w-full h-full min-h-[60vh] border-0"
                      title={previewAttachment.name || 'Document PDF'}
                      onError={() => {
                        console.warn('Impossible de charger le PDF dans l\'iframe');
                        setIframeError(true);
                      }}
                      onLoad={() => {
                        setIframeError(false);
                      }}
                    />
                  ) : (
                    <div className="text-center text-slate-500">
                      <Upload className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                      <p className="mb-4">Aperçu non disponible pour ce type de fichier</p>
                      <div className="flex gap-2 justify-center">
                        <Button
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => window.open(previewAttachment.url, '_blank')}
                        >
                          Ouvrir dans un onglet
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = previewAttachment.url;
                            link.download = previewAttachment.name || 'document';
                            link.click();
                          }}
                        >
                          Télécharger
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

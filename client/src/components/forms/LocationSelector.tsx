import { useState, useEffect, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";

interface LocationData {
  id: number;
  nom: string;
  region_id?: number;
  departement_id?: number;
}

interface LocationSelectorProps {
  selectedRegion?: string;
  selectedDepartement?: string;
  selectedCommune?: string;
  selectedArrondissement?: string;
  onRegionChange?: (value: string) => void;
  onDepartementChange?: (value: string) => void;
  onCommuneChange?: (value: string) => void;
  onArrondissementChange?: (value: string) => void;
  showCommune?: boolean;
  showArrondissement?: boolean;
  disabled?: boolean;
  disableRegion?: boolean;
  disableDepartement?: boolean;
}

export default function LocationSelector({
  selectedRegion,
  selectedDepartement,
  selectedCommune,
  selectedArrondissement,
  onRegionChange,
  onDepartementChange,
  onCommuneChange,
  onArrondissementChange,
  showCommune = true,
  showArrondissement = true,
  disabled = false,
  disableRegion = false,
  disableDepartement = false,
}: LocationSelectorProps) {
  const [regions, setRegions] = useState<LocationData[]>([]);
  const [departements, setDepartements] = useState<LocationData[]>([]);
  const [communes, setCommunes] = useState<LocationData[]>([]);
  const [arrondissements, setArrondissements] = useState<LocationData[]>([]);
  
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingDepartements, setLoadingDepartements] = useState(false);
  const [loadingCommunes, setLoadingCommunes] = useState(false);
  const [loadingArrondissements, setLoadingArrondissements] = useState(false);

  // Charger les régions au montage
  useEffect(() => {
    const loadRegions = async () => {
      try {
        setLoadingRegions(true);
        // Préférer l'endpoint public /api/statuses/regions (déclaré public côté backend)
        const response = await apiRequest<any>('GET', '/api/statuses/regions');
        const arr = (response?.data || response || []) as Array<any>;
        if (Array.isArray(arr) && arr.length > 0) {
          const regionsData = arr.map((r: any) => ({
            id: Number(r.id ?? r.region_id ?? Math.random()),
            nom: String(r.name ?? r.nom ?? r.NOM_REGION ?? 'Région inconnue').trim()
          }));
          setRegions(regionsData);
          return;
        }
        // Fallback: utiliser l'ancien endpoint GeoJSON si disponible
        try {
          const resp2 = await apiRequest<any>('GET', '/api/regions');
          const featureCollection = resp2?.data || resp2;
          const features = featureCollection?.features || [];
          const regionsData = features.map((feature: any) => ({
            id: feature.properties?.id || Math.random(),
            nom: (feature.properties?.nom || feature.properties?.NOM_REGION || 'Région inconnue').toString().trim()
          }));
          setRegions(regionsData);
        } catch (fallbackErr) {
          console.error('Erreur fallback /api/regions:', fallbackErr);
          setRegions([]);
        }
      } catch (error) {
        console.error('Erreur chargement régions:', error);
        setRegions([]); // Assurer que regions n'est jamais undefined
      } finally {
        setLoadingRegions(false);
      }
    };
    loadRegions();
  }, []);

  // Normalisation simple pour comparer les libellés (accents/casse/espaces)
  const normalize = (s?: string) => (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Charger les départements quand une région est sélectionnée
  useEffect(() => {
    if (selectedRegion) {
      const loadDepartements = async () => {
        try {
          setLoadingDepartements(true);
          const regionMatch = regions.find(r => normalize(r.nom) === normalize(selectedRegion));
          // Prefer regionId if it's a numeric DB id, else fallback to regionName to let backend resolve id
          const url = regionMatch && Number.isFinite(Number(regionMatch.id))
            ? `/api/statuses/departements?regionId=${regionMatch.id}`
            : `/api/statuses/departements?regionName=${encodeURIComponent(selectedRegion)}`;
          const response = await apiRequest<any>('GET', url);
          const raw = (response?.data || []) as Array<any>;
          // API returns [{ id, name, statut, color }]; map to local shape { id, nom }
          const mapped = Array.isArray(raw)
            ? raw.map((d) => ({ id: Number(d.id), nom: String(d.name ?? d.nom ?? '').trim() }))
            : [];
          setDepartements(mapped);
        } catch (error) {
          console.error('Erreur chargement départements:', error);
          setDepartements([]); // Assurer que departements n'est jamais undefined
        } finally {
          setLoadingDepartements(false);
        }
      };
      loadDepartements();
    } else {
      setDepartements([]);
      setCommunes([]);
      setArrondissements([]);
    }
  }, [selectedRegion, regions]);

  // Charger les communes quand un département est sélectionné
  useEffect(() => {
    if (selectedDepartement && showCommune) {
      const loadCommunes = async () => {
        try {
          setLoadingCommunes(true);
          const departementId = departements.find(d => normalize(d.nom) === normalize(selectedDepartement))?.id;
          if (departementId) {
            const response = await apiRequest<any>('GET', `/api/statuses/communes?departementId=${departementId}`);
            const raw = (response?.data || []) as Array<any>;
            // API returns [{ id, name, statut, color }]; map to local shape { id, nom }
            const mapped = Array.isArray(raw)
              ? raw.map((c) => ({ id: Number(c.id), nom: String(c.name ?? c.nom ?? '').trim() }))
              : [];
            setCommunes(mapped);
          }
        } catch (error) {
          console.error('Erreur chargement communes:', error);
          setCommunes([]); // Assurer que communes n'est jamais undefined
        } finally {
          setLoadingCommunes(false);
        }
      };
      loadCommunes();
    } else {
      setCommunes([]);
    }
  }, [selectedDepartement, departements, showCommune]);

  // Charger les arrondissements quand un département est sélectionné
  useEffect(() => {
    if (selectedDepartement && showArrondissement) {
      const loadArrondissements = async () => {
        try {
          setLoadingArrondissements(true);
          const departementId = departements.find(d => d.nom === selectedDepartement)?.id;
          if (departementId) {
            const response = await apiRequest<any>('GET', `/api/statuses/arrondissements?departementId=${departementId}`);
            const raw = (response?.data || []) as Array<any>;
            // API returns [{ id, name, statut, color }]; map to local shape { id, nom }
            const mapped = Array.isArray(raw)
              ? raw.map((a) => ({ id: Number(a.id), nom: String(a.name ?? a.nom ?? '').trim() }))
              : [];
            setArrondissements(mapped);
          }
        } catch (error) {
          console.error('Erreur chargement arrondissements:', error);
          setArrondissements([]); // Assurer que arrondissements n'est jamais undefined
        } finally {
          setLoadingArrondissements(false);
        }
      };
      loadArrondissements();
    } else {
      setArrondissements([]);
    }
  }, [selectedDepartement, departements, showArrondissement]);

  const handleRegionChange = useCallback((value: string) => {
    try {
      onRegionChange?.(value.trim());
      onDepartementChange?.('');
      onCommuneChange?.('');
      onArrondissementChange?.('');
    } catch (error) {
      console.error('Erreur handleRegionChange:', error);
    }
  }, [onRegionChange, onDepartementChange, onCommuneChange, onArrondissementChange]);

  const handleDepartementChange = useCallback((value: string) => {
    try {
      onDepartementChange?.(value.trim());
      onCommuneChange?.('');
      onArrondissementChange?.('');
    } catch (error) {
      console.error('Erreur handleDepartementChange:', error);
    }
  }, [onDepartementChange, onCommuneChange, onArrondissementChange]);

  const handleCommuneChange = useCallback((value: string) => {
    try {
      onCommuneChange?.(value.trim());
      onArrondissementChange?.('');
    } catch (error) {
      console.error('Erreur handleCommuneChange:', error);
    }
  }, [onCommuneChange, onArrondissementChange]);

  const handleArrondissementChange = useCallback((value: string) => {
    try {
      onArrondissementChange?.(value.trim());
    } catch (error) {
      console.error('Erreur handleArrondissementChange:', error);
    }
  }, [onArrondissementChange]);


  return (
    <>
      <div>
        <Label>Région</Label>
        {(() => {
          const canonicalRegion = regions.find(r => normalize(r.nom) === normalize(selectedRegion))?.nom || (selectedRegion || "");
          return (
            <Select value={canonicalRegion} onValueChange={handleRegionChange} disabled={disabled || disableRegion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(regions || []).map((region) => (
                  <SelectItem key={region.id} value={region.nom}>
                    {region.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })()}
      </div>

      <div>
        <Label>Département</Label>
        <Select 
          value={(selectedDepartement && (departements.find(d => normalize(d.nom) === normalize(selectedDepartement))?.nom)) || ""} 
          onValueChange={handleDepartementChange}
          disabled={disabled || disableDepartement || !selectedRegion}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(departements || []).map((departement) => (
              <SelectItem key={departement.id} value={departement.nom}>
                {departement.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showCommune && (
        <div>
          <Label>Commune</Label>
          <Select 
            value={(selectedCommune && (communes.find(c => normalize(c.nom) === normalize(selectedCommune))?.nom)) || ""} 
            onValueChange={handleCommuneChange}
            disabled={!selectedDepartement}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !selectedDepartement 
                  ? "Sélectionner d'abord un département" 
                  : loadingCommunes 
                  ? "Chargement..." 
                  : "Sélectionner une commune"
              } />
            </SelectTrigger>
            <SelectContent>
              {(communes || []).map((commune) => (
                <SelectItem key={commune.id} value={commune.nom}>
                  {commune.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showArrondissement && (
        <div>
          <Label>Arrondissement</Label>
          <Select 
            value={(selectedArrondissement && (arrondissements.find(a => normalize(a.nom) === normalize(selectedArrondissement))?.nom)) || ""} 
            onValueChange={handleArrondissementChange}
            disabled={!selectedDepartement}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !selectedDepartement 
                  ? "Sélectionner d'abord un département" 
                  : loadingArrondissements 
                  ? "Chargement..." 
                  : "Sélectionner un arrondissement"
              } />
            </SelectTrigger>
            <SelectContent>
              {(arrondissements || []).map((arrondissement) => (
                <SelectItem key={arrondissement.id} value={arrondissement.nom}>
                  {arrondissement.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

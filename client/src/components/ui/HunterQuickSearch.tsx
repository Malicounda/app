import { useState, useEffect } from "react";
import { Search, User, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Hunter, Permit } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface HunterQuickSearchProps {
  onHunterSelect: (hunter: any) => void;
  // Optionnel: renvoyer le résultat complet (utile si match par n° de permis)
  onResultSelect?: (result: { hunter: any; permit?: Permit; matchType: 'idNumber' | 'permitNumber'; matchValue: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  selectedHunterId?: number;
  hunters?: any[]; // Liste des chasseurs à utiliser pour la recherche
  enablePermitSearch?: boolean; // Active la recherche par numéro de permis via l'API
}

interface SearchResult {
  hunter: any;
  matchType: 'idNumber' | 'permitNumber';
  matchValue: string;
  permit?: Permit;
}

export default function HunterQuickSearch({
  onHunterSelect,
  onResultSelect,
  placeholder = "Rechercher par pièce d'identité ou n° de permis...",
  disabled = false,
  selectedHunterId,
  hunters = [],
  enablePermitSearch = false,
}: HunterQuickSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHunter, setSelectedHunter] = useState<any | null>(null);

  // Charger le chasseur sélectionné si un ID est fourni
  useEffect(() => {
    if (selectedHunterId && selectedHunterId > 0) {
      // Chercher dans la liste locale des chasseurs fournie
      const hunter = hunters.find(h => h.id === selectedHunterId);
      setSelectedHunter(hunter || null);
    } else {
      setSelectedHunter(null);
    }
  }, [selectedHunterId, hunters]);

  // Fonction de recherche locale dans la liste fournie
  useEffect(() => {
    const searchTimeout = setTimeout(() => {
      if (searchValue.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsLoading(true);
      
      try {
        const results: SearchResult[] = [];
        const searchLower = searchValue.toLowerCase();

        // Rechercher dans la liste des chasseurs fournie
        hunters.forEach(hunter => {
          // Recherche par numéro de pièce d'identité
          if (hunter.idNumber?.toLowerCase().includes(searchLower)) {
            results.push({
              hunter,
              matchType: 'idNumber',
              matchValue: hunter.idNumber || ''
            });
          }
          // Recherche par nom ou prénom
          else if (
            hunter.firstName?.toLowerCase().includes(searchLower) ||
            hunter.lastName?.toLowerCase().includes(searchLower) ||
            `${hunter.firstName} ${hunter.lastName}`.toLowerCase().includes(searchLower)
          ) {
            results.push({
              hunter,
              matchType: 'idNumber',
              matchValue: `${hunter.firstName} ${hunter.lastName}`
            });
          }
        });

        const finalize = (merged: SearchResult[]) => {
          setSearchResults(merged);
        };

        if (!enablePermitSearch) {
          finalize(results);
          return;
        }

        // Recherche par N° de permis via l'API
        (async () => {
          try {
            const permits = await apiRequest<any[]>({ url: `/api/permits/search?query=${encodeURIComponent(searchValue)}`, method: 'GET' });
            if (Array.isArray(permits)) {
              const permitResults: SearchResult[] = permits.map((p: any) => {
                // Résoudre le chasseur depuis la liste locale si possible, sinon fallback depuis les champs inclus dans la réponse
                const hLocal = hunters.find(h => h.id === p.hunterId) || {
                  id: p.hunterId,
                  firstName: p.hunterFirstName || '',
                  lastName: p.hunterLastName || '',
                  idNumber: p.hunterIdNumber || '',
                };
                return {
                  hunter: hLocal,
                  matchType: 'permitNumber',
                  matchValue: p.permitNumber,
                  permit: p as Permit,
                } as SearchResult;
              });
              // Fusionner en évitant les doublons exacts (hunterId + matchType + matchValue)
              const key = (r: SearchResult) => `${r.hunter?.id || 'x'}|${r.matchType}|${(r.matchValue || '').toLowerCase()}`;
              const mergedMap = new Map<string, SearchResult>();
              [...results, ...permitResults].forEach(r => mergedMap.set(key(r), r));
              finalize(Array.from(mergedMap.values()));
            } else {
              finalize(results);
            }
          } catch (e) {
            console.warn('[HunterQuickSearch] permit search failed:', e);
            finalize(results);
          }
        })();
      } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchValue, hunters]);

  const handleSelect = (result: SearchResult) => {
    setSelectedHunter(result.hunter);
    onHunterSelect(result.hunter);
    if (onResultSelect) {
      onResultSelect({ hunter: result.hunter, permit: result.permit, matchType: result.matchType, matchValue: result.matchValue });
    }
    setOpen(false);
    setSearchValue("");
  };

  const clearSelection = () => {
    setSelectedHunter(null);
    setSearchValue("");
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700">
        Recherche rapide
      </div>
      
      {selectedHunter ? (
        <div className="flex items-center justify-between p-3 border rounded-md bg-green-50 border-green-200">
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-green-600" />
            <div>
              <div className="font-medium text-green-800">
                {selectedHunter.firstName} {selectedHunter.lastName}
              </div>
              <div className="text-sm text-green-600">
                ID: {selectedHunter.idNumber}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={disabled}
            className="text-green-600 hover:text-green-800"
          >
            Changer
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={placeholder}
              value={searchValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchValue(e.target.value)}
              disabled={disabled}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
            />
          </div>
          
          {open && (searchResults.length > 0 || isLoading || searchValue.trim().length >= 2) && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Recherche en cours...
                </div>
              ) : searchResults.length === 0 && searchValue.trim().length >= 2 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Aucun chasseur trouvé.
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Tapez au moins 2 caractères pour rechercher
                </div>
              ) : (
                <div>
                  {searchResults.map((result, index) => (
                    <div
                      key={`${result.hunter.id}-${index}`}
                      onClick={() => handleSelect(result)}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center space-x-3">
                        {result.matchType === 'idNumber' ? (
                          <User className="h-4 w-4 text-blue-500" />
                        ) : (
                          <FileText className="h-4 w-4 text-green-500" />
                        )}
                        <div>
                          <div className="font-medium">
                            {result.hunter.firstName} {result.hunter.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            ID: {result.hunter.idNumber}
                          </div>
                          {result.permit && (
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span>Permis: <span className="font-semibold">{result.permit.permitNumber}</span></span>
                              <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                {(result.permit as any).categoryId || (result.permit as any).type || '—'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={result.matchType === 'idNumber' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                      >
                        {result.matchType === 'idNumber' ? 'Pièce ID' : 'N° Permis'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

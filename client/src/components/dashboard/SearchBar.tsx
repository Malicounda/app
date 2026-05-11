import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SearchBarProps {
  onResults: (results: any) => void;
}

export default function SearchBar({ onResults }: SearchBarProps) {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState("idNumber");
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchValue.trim()) {
      toast({
        title: "Champ requis",
        description: "Veuillez entrer une valeur de recherche",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    
    try {
      let hunterResponse;
      
      // Search hunter by the selected type
      if (searchType === "idNumber") {
        hunterResponse = await fetch(`/api/hunters/search/idNumber/${searchValue}`);
      } else if (searchType === "phone") {
        hunterResponse = await fetch(`/api/hunters/search/phone/${searchValue}`);
      } else if (searchType === "permitNumber") {
        // First search for permit
        const permitResponse = await fetch(`/api/permits/number/${searchValue}`);
        
        if (permitResponse.ok) {
          const permit = await permitResponse.json();
          // Then get hunter by ID
          hunterResponse = await fetch(`/api/hunters/${permit.hunterId}`);
          
          // If hunter found, pass both hunter and permit
          if (hunterResponse.ok) {
            const hunter = await hunterResponse.json();
            
            // Get all permits for this hunter
            const permitsResponse = await fetch(`/api/permits/hunter/${hunter.id}`);
            const permits = permitsResponse.ok ? await permitsResponse.json() : [];
            
            onResults({
              hunter,
              permits,
              foundBy: "permitNumber"
            });
            setIsSearching(false);
            return;
          }
        } else {
          toast({
            title: "Permis non trouvé",
            description: "Aucun permis trouvé avec ce numéro",
            variant: "destructive",
          });
          onResults(null);
          setIsSearching(false);
          return;
        }
      }
      
      // If hunter found, get their permits
      if (hunterResponse && hunterResponse.ok) {
        const hunter = await hunterResponse.json();
        const permitsResponse = await fetch(`/api/permits/hunter/${hunter.id}`);
        const permits = permitsResponse.ok ? await permitsResponse.json() : [];
        
        onResults({
          hunter,
          permits,
          foundBy: searchType
        });
      } else {
        toast({
          title: "Résultat non trouvé",
          description: "Aucun chasseur trouvé avec ces informations",
          variant: "destructive",
        });
        onResults(null);
      }
    } catch (error) {
      console.error("Error searching:", error);
      toast({
        title: "Erreur de recherche",
        description: "Une erreur s'est produite lors de la recherche",
        variant: "destructive",
      });
      onResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 items-center">
          <div className="w-full sm:w-1/3 lg:w-1/4 px-2">
            <Select value={searchType} onValueChange={setSearchType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idNumber">Numéro de pièce d'identité</SelectItem>
                <SelectItem value="phone">Numéro de téléphone</SelectItem>
                <SelectItem value="permitNumber">Numéro de permis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-2/3 lg:w-2/4 px-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <div className="relative">
                <Input
                  type="text"
                  id="search-input"
                  placeholder="Rechercher un chasseur..."
                  className="pl-10 pr-10"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                {searchValue && (
                  <button
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => {
                      setSearchValue('');
                      onResults(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="w-full sm:w-auto px-2">
            <Button
              variant="default"
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full sm:w-auto"
            >
              {isSearching ? "Recherche..." : "Rechercher"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

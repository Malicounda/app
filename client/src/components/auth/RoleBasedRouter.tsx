import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { getHomePage } from "@/utils/navigation";

export default function RoleBasedRouter() {
  const { user, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }

    // Nouveau flux: rediriger toujours vers la page d'accueil du rôle.
    // Le dashboard chasseur affichera l'étape 2 en modal bloquante si nécessaire.
    const homePage = getHomePage(user?.role, user?.type);
    setLocation(homePage);
  }, [isAuthenticated, user, setLocation]);
  
  // Ce composant ne rend rien, il effectue uniquement la redirection
  return null;
}

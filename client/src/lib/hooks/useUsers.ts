import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient'; 
import { User } from '@shared/schema'; 

// Type pour les utilisateurs retournés par l'API (sans mot de passe)
// Vous pourriez avoir un type plus spécifique si User inclut des champs sensibles
// Si votre type User partagé est déjà "safe", vous pouvez utiliser User directement.
// Pour l'instant, je vais supposer qu'il faut au moins enlever 'password' si présent.
// Le backend enlève déjà 'password', donc User devrait être sûr.
// Cependant, pour être explicite, on peut définir un type plus précis.
type EligibleUser = Pick<User, 'id' | 'username' | 'firstName' | 'lastName' | 'email' | 'role' | 'isActive' | 'createdAt' | 'hunterId'>;

const fetchEligibleUsersForHunterProfile = async (): Promise<EligibleUser[]> => {
  return apiRequest<EligibleUser[]>({ url: '/api/users/eligible-for-hunter-profile', method: 'GET' });
};

export const useEligibleUsersForHunterProfile = (enabled: boolean = true) => {
  return useQuery<EligibleUser[], Error>({
    queryKey: ['eligibleUsersForHunterProfile'],
    queryFn: fetchEligibleUsersForHunterProfile,
    enabled,
    retry: false,
  });
};

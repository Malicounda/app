import { storage } from '../storage';
import { User } from '../../shared/schema/types/auth';

export const userService = {
    async getUserByUsername(username: string): Promise<User | undefined> {
        // Ceci est une implémentation temporaire. Dans une application réelle, vous utiliseriez une base de données.
        // Pour l'instant, nous utilisons le stockage en mémoire.
        const user = storage.users.find(u => u.username === username);
        return user;
    },
    // Ajoutez d'autres fonctions liées aux utilisateurs ici si nécessaire
};
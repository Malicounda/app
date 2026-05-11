import { storage } from '../storage';
import { User, LoginCredentials } from '../../shared/schema/types/auth';
import { userService } from './user.service';
import bcrypt from 'bcryptjs';

export const authService = {
    async login(credentials: LoginCredentials): Promise<User | undefined> {
        const user = await userService.getUserByUsername(credentials.username);

        if (!user) {
            return undefined; // Utilisateur non trouvé
        }

        // Vérification du mot de passe (utiliser bcrypt.compare pour les mots de passe hachés)
        // Pour l'instant, nous utilisons une comparaison simple car les mots de passe ne sont pas hachés dans le stockage temporaire.
        // Dans une application réelle, vous utiliseriez: const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);
        const isPasswordValid = credentials.password === user.password; // TEMPORAIRE

        if (!isPasswordValid) {
            return undefined; // Mot de passe incorrect
        }

        // Dans une application réelle, vous généreriez des tokens (JWT, etc.) ici.
        // Pour l'instant, nous retournons simplement l'utilisateur (sans le mot de passe).
        const { password, ...userWithoutPassword } = user;

        // Ajouter une entrée d'historique (peut être déplacé vers le service d'historique si nécessaire)
        await storage.createHistory({
            userId: user.id,
            operation: "login",
            entityType: "user",
            entityId: user.id,
            details: "Connexion réussie"
        });

        return userWithoutPassword as User; // Retourne l'utilisateur sans le mot de passe
    },

    // Ajoutez d'autres fonctions d'authentification ici (logout, refresh token, etc.)
};
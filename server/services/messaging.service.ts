import { Response } from "express";
import { Message, agents, rolesMetier } from "../../shared/schema.js";
import { storage } from "../storage.js";
import { db } from "../db.js";
import { eq } from "drizzle-orm";

/**
 * DomainResolver : Machine à état pour la résolution du contexte.
 */
export type ResolutionResult =
  | { status: "RESOLVED"; domaineId: number | null }
  | { status: "REQUIRED"; availableDomains: number[] }
  | { status: "FORBIDDEN"; message: string };

export class DomainResolver {
  static async resolve(userId: number, contextId?: any): Promise<ResolutionResult> {
    const user = await storage.getUser(userId);
    if (!user) {
      return { status: "FORBIDDEN", message: "Utilisateur introuvable." };
    }

    // L'appartenance à un domaine est vérifiée ci-dessous.

    const domains = await storage.getUserDomains(userId);

    if (domains.length === 0) {
      // Les agents de l'alerte, les chasseurs, guides et admins globaux 
      // n'ont pas forcément de domaine assigné.
      // Ils accèdent donc à la messagerie dans un contexte global (domaineId = null).
      return { status: "RESOLVED", domaineId: null };
    }

    // Cas 1 : Domaine unique (Déterministe)
    if (domains.length === 1) {
      return { status: "RESOLVED", domaineId: domains[0] };
    }

    // Cas 2 : Multi-domaines avec contexte fourni
    if (contextId) {
      const id = Number(contextId);
      if (!isNaN(id) && domains.includes(id)) {
        return { status: "RESOLVED", domaineId: id };
      }
      return { status: "FORBIDDEN", message: "Accès refusé pour ce domaine spécifique." };
    }

    // Cas 3 : Multi-domaines sans contexte -> État EXPLICITE requis
    return { status: "REQUIRED", availableDomains: domains };
  }
}

/**
 * MessagingPolicy : Gère les permissions.
 */
export class MessagingPolicy {
  static canView(userId: number, message: Message): boolean {
    const isParticipant = message.senderId === userId || message.recipientId === userId;
    if (!isParticipant) return false;
    if (message.recipientId === userId && message.deletedAt) return false;
    if (message.senderId === userId && message.deletedAtSender) return false;
    return true;
  }
}

/**
 * MessagingService : Orchestrateur de contexte.
 */
export class MessagingService {
  static async getAuthorizedContext(userId: number, requestedId: any, res: Response): Promise<number | null | false> {
    const result = await DomainResolver.resolve(userId, requestedId);

    switch (result.status) {
      case "RESOLVED":
        return result.domaineId;

      case "REQUIRED":
        res.status(400).json({
          status: "CONTEXT_REQUIRED",
          message: "Un contexte de domaine est requis pour ce profil multi-domaines.",
          availableDomains: result.availableDomains,
          suggestedAction: "SELECT_DOMAIN"
        });
        return false;

      case "FORBIDDEN":
        res.status(403).json({
          status: "ACCESS_DENIED",
          message: result.message
        });
        return false;
    }
  }
}


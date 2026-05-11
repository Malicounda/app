// c:/Users/hp/Documents/A.S.P.CH.S/server/controllers/regional.controller.ts
import { Request, Response } from 'express';
import { db } from '../db.js';
import { users } from '../../shared/schema.js'; // Chemin ajusté pour shared/schema.ts
import { eq, and } from 'drizzle-orm';

export const getMySectorAgents = async (req: Request, res: Response) => {
  try {
    const regionalAgent = req.user;

    if (!regionalAgent || !regionalAgent.region) {
      console.error("[API] Tentative d'accès à getMySectorAgents sans informations de région ou d'agent valides.", { user: req.user });
      return res.status(400).json({ message: "Impossible de déterminer la région de l'agent connecté ou agent non valide." });
    }

    const regionalAgentRegion = regionalAgent.region;

    const queryConditions = [eq(users.role as any, 'sub-agent')];
    if (regionalAgentRegion) {
      queryConditions.push(eq(users.region as any, regionalAgentRegion));
    } else {
      // Si regionalAgentRegion est null/undefined, on ne veut retourner aucun agent car le filtrage par région est essentiel.
      // Ou, si la logique métier le permet, on pourrait ne pas filtrer par région, mais ici c'est un requis.
      console.log(`[API] Agent régional ${regionalAgent.username} n'a pas de région définie. Aucun agent secteur ne sera retourné.`);
      return res.status(200).json([]);
    }

    const sectorAgents = await db
      .select()
      .from(users as any)
      .where(and(...queryConditions));

    console.log(`[API] Agent régional ${regionalAgent.username} (région: ${regionalAgentRegion}) a récupéré ${sectorAgents.length} agents secteur.`);
    res.status(200).json(sectorAgents);

  } catch (error) {
    console.error("Erreur lors de la récupération des agents secteur:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des agents secteur." });
  }
};

import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { themeSysteme } from '../../shared/schema.js';
import { db } from '../db.js';

// GET /api/themes/active - Récupérer le thème actif
export async function getActiveTheme(req: Request, res: Response) {
  try {
    const [theme] = await db
      .select()
      .from(themeSysteme)
      .where(eq(themeSysteme.isActive, true))
      .limit(1);

    if (!theme) {
      return res.json(null);
    }
    return res.json(theme);
  } catch (e: any) {
    console.error('Erreur getActiveTheme:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération du thème' });
  }
}

// GET /api/themes - Lister tous les thèmes enregistrés
export async function listThemes(req: Request, res: Response) {
  try {
    const themes = await db.select().from(themeSysteme);
    return res.json(themes);
  } catch (e: any) {
    console.error('Erreur listThemes:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

// POST /api/themes - Créer ou mettre à jour un thème (upsert par nom)
export async function saveTheme(req: Request, res: Response) {
  try {
    const { nom, config, isActive } = req.body;

    if (!nom || !config) {
      return res.status(400).json({ message: 'Les champs "nom" et "config" sont obligatoires' });
    }

    // Vérifier si un thème avec ce nom existe déjà
    const [existing] = await db
      .select()
      .from(themeSysteme)
      .where(eq(themeSysteme.nom, nom));

    // Si on active ce thème, désactiver tous les autres
    if (isActive) {
      await db
        .update(themeSysteme)
        .set({ isActive: false } as any);
    }

    let result;
    if (existing) {
      // Mettre à jour le thème existant
      [result] = await db
        .update(themeSysteme)
        .set({
          config,
          isActive: isActive ?? existing.isActive,
          updatedAt: new Date(),
        } as any)
        .where(eq(themeSysteme.id, existing.id))
        .returning();
    } else {
      // Créer un nouveau thème
      [result] = await db
        .insert(themeSysteme)
        .values({
          nom,
          config,
          isActive: isActive ?? false,
        } as any)
        .returning();
    }

    return res.json(result);
  } catch (e: any) {
    console.error('Erreur saveTheme:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la sauvegarde du thème' });
  }
}

// DELETE /api/themes/:id - Supprimer un thème
export async function deleteTheme(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [deleted] = await db
      .delete(themeSysteme)
      .where(eq(themeSysteme.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'Thème non trouvé' });
    }

    return res.json({ success: true, deleted });
  } catch (e: any) {
    console.error('Erreur deleteTheme:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la suppression' });
  }
}

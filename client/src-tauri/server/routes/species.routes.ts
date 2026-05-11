import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const connectionString = process.env.DATABASE_URL || "";
const client = postgres(connectionString, { max: 1 });

const router = Router();

// GET /api/species -> liste des espèces
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Utiliser une requête SQL directe pour récupérer les espèces
    const result = await client`
      SELECT 
        id,
        species_id as "speciesId",
        name,
        price,
        code,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM taxe_especes 
      WHERE is_active = true 
      ORDER BY created_at DESC
    `;
    
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Table taxe_especes non trouvée, utilisation des données par défaut:', msg);
    
    // Données par défaut si la table n'existe pas
    const defaultSpecies = [
      { id: 1, speciesId: "PHA1", name: "Phacochère (1)", price: 15000, code: "PHA1", isActive: true },
      { id: 2, speciesId: "CEPH", name: "Céphalophe", price: 40000, code: "CEPH", isActive: true },
      { id: 3, speciesId: "PHA2", name: "Phacochère (2)", price: 20000, code: "PHA2", isActive: true },
      { id: 4, speciesId: "PHA3", name: "Phacochère (3)", price: 25000, code: "PHA3", isActive: true },
      { id: 5, speciesId: "GFR", name: "Gazelle front roux", price: 50000, code: "GFR", isActive: true },
      { id: 6, speciesId: "BUF", name: "Buffle", price: 200000, code: "BUF", isActive: true },
      { id: 7, speciesId: "COB", name: "Cobe de Buffon", price: 100000, code: "COB", isActive: true },
      { id: 8, speciesId: "OUR", name: "Ourébi", price: 40001, code: "OUR", isActive: true },
      { id: 9, speciesId: "GUH", name: "Guib harnaché", price: 60000, code: "GUH", isActive: true },
      { id: 10, speciesId: "HIP", name: "Hippotrague", price: 200000, code: "HIP", isActive: true },
      { id: 11, speciesId: "BUB", name: "Bubale", price: 100000, code: "BUB", isActive: true },
    ];
    
    return res.json(defaultSpecies);
  }
});

// GET /api/species/:id -> détail d'une espèce
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ message: "Paramètre id invalide" });
    }
    
    const result = await client`
      SELECT 
        id,
        species_id as "speciesId",
        name,
        price,
        code,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM taxe_especes 
      WHERE id = ${idNum}
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ message: "Espèce introuvable" });
    }
    
    return res.json(result[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erreur GET /api/species/:id:', msg);
    return res.status(500).json({ message: "Impossible de charger l'espèce" });
  }
});

// POST /api/species -> créer une nouvelle espèce
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { name, price, code } = req.body;
    
    // Validation des données requises
    if (!name || !price || !code) {
      return res.status(400).json({ 
        message: "Données manquantes: name, price, code sont requis" 
      });
    }
    
    // Vérifier si le code existe déjà
    const existingSpecies = await client`
      SELECT id FROM taxe_especes WHERE code = ${code.toUpperCase()}
    `;
    
    if (existingSpecies.length > 0) {
      return res.status(400).json({ 
        message: "Une espèce avec ce code existe déjà" 
      });
    }
    
    // Générer un speciesId unique
    const speciesId = code.toUpperCase();
    
    const result = await client`
      INSERT INTO taxe_especes (species_id, name, price, code, is_active, created_at, updated_at)
      VALUES (${speciesId}, ${name.trim()}, ${Number(price)}, ${code.toUpperCase()}, true, ${new Date()}, ${new Date()})
      RETURNING *
    `;
    
    return res.status(201).json({
      message: "Espèce créée avec succès",
      species: result[0]
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erreur POST /api/species:', msg);
    return res.status(500).json({ message: "Impossible de créer l'espèce" });
  }
});

// PUT /api/species/:id -> mettre à jour une espèce
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ message: "Paramètre id invalide" });
    }
    
    const { name, price, code, isActive } = req.body;
    
    // Vérifier que l'espèce existe
    const existingSpecies = await client`
      SELECT id FROM taxe_especes WHERE id = ${idNum}
    `;
    
    if (existingSpecies.length === 0) {
      return res.status(404).json({ message: "Espèce introuvable" });
    }
    
    // Vérifier si le code existe déjà (sauf pour l'espèce actuelle)
    if (code) {
      const duplicateCode = await client`
        SELECT id FROM taxe_especes WHERE code = ${code.toUpperCase()} AND id != ${idNum}
      `;
      
      if (duplicateCode.length > 0) {
        return res.status(400).json({ 
          message: "Une espèce avec ce code existe déjà" 
        });
      }
    }
    
    // Construire la requête de mise à jour dynamiquement avec paramètres
    const setClauses: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      params.push(String(name).trim());
      setClauses.push(`name = $${params.length}`);
    }
    if (price !== undefined) {
      params.push(Number(price));
      setClauses.push(`price = $${params.length}`);
    }
    if (code !== undefined) {
      params.push(String(code).toUpperCase());
      setClauses.push(`code = $${params.length}`);
    }
    if (isActive !== undefined) {
      params.push(Boolean(isActive));
      setClauses.push(`is_active = $${params.length}`);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: "Aucune donnée à mettre à jour" });
    }

    // Always update timestamp
    params.push(new Date());
    setClauses.push(`updated_at = $${params.length}`);

    // WHERE id param
    params.push(idNum);

    await client.unsafe(
      `UPDATE taxe_especes SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
      params
    );
    
    return res.json({ message: "Espèce mise à jour avec succès" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erreur PUT /api/species/:id:', msg);
    return res.status(500).json({ message: "Impossible de mettre à jour l'espèce" });
  }
});

// DELETE /api/species/:id -> supprimer une espèce (soft delete)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ message: "Paramètre id invalide" });
    }
    
    // Vérifier que l'espèce existe
    const existingSpecies = await client`
      SELECT id FROM taxe_especes WHERE id = ${idNum}
    `;
    
    if (existingSpecies.length === 0) {
      return res.status(404).json({ message: "Espèce introuvable" });
    }
    
    // Soft delete en mettant isActive à false
    await client`
      UPDATE taxe_especes 
      SET is_active = false, updated_at = ${new Date()}
      WHERE id = ${idNum}
    `;
    
    return res.json({ message: "Espèce supprimée avec succès" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erreur DELETE /api/species/:id:', msg);
    return res.status(500).json({ message: "Impossible de supprimer l'espèce" });
  }
});

export default router;

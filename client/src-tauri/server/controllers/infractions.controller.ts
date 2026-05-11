import { Request, Response } from 'express';
import { pg as pgdb } from '../db.js';
import multer from 'multer';

const storage = multer.memoryStorage();
export const upload = multer({ storage });
// Compatibilité: garder le nom "db" utilisé dans le fichier
const db = pgdb;

// =====================================================
// 📋 CODES D'INFRACTIONS
// =====================================================

export const getCodesInfractions = async (req: Request, res: Response) => {
  try {
    const result = await pgdb.query(
      'SELECT * FROM code_infractions ORDER BY code ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des codes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createCodeInfraction = async (req: Request, res: Response) => {
  try {
    const { code, nature, description, article_code, code_collectivite } = req.body;

    const result = await db.query(
      `INSERT INTO code_infractions (code, nature, description, article_code, code_collectivite)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code, nature, description, article_code, code_collectivite]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création du code:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce code existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const updateCodeInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, nature, description, article_code, code_collectivite } = req.body;

    const result = await db.query(
      `UPDATE code_infractions 
       SET code = $1, nature = $2, description = $3, article_code = $4, 
           code_collectivite = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [code, nature, description, article_code, code_collectivite, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteCodeInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM code_infractions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code non trouvé' });
    }

    res.json({ message: 'Code supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 👮 AGENTS VERBALISATEURS
// =====================================================

export const getAgentsVerbalisateurs = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      'SELECT * FROM agents_verbalisateurs ORDER BY nom, prenom ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createAgentVerbalisateur = async (req: Request, res: Response) => {
  try {
    const { nom, prenom, matricule, fonction } = req.body;
    const signature = req.file?.buffer;

    const result = await db.query(
      `INSERT INTO agents_verbalisateurs (nom, prenom, matricule, fonction, signature)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nom, prenom, matricule, fonction, signature]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création de l\'agent:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce matricule existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const updateAgentVerbalisateur = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nom, prenom, matricule, fonction } = req.body;
    const signature = req.file?.buffer;

    let query = `UPDATE agents_verbalisateurs 
                 SET nom = $1, prenom = $2, matricule = $3, fonction = $4, 
                     updated_at = CURRENT_TIMESTAMP`;
    const params: any[] = [nom, prenom, matricule, fonction];

    if (signature) {
      query += `, signature = $5 WHERE id = $6 RETURNING *`;
      params.push(signature, id);
    } else {
      query += ` WHERE id = $5 RETURNING *`;
      params.push(id);
    }

    const result = await pgdb.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteAgentVerbalisateur = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM agents_verbalisateurs WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }

    res.json({ message: 'Agent supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 👤 CONTREVENANTS
// =====================================================

export const getContrevenants = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      'SELECT * FROM contrevenants ORDER BY nom, prenom ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des contrevenants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createContrevenant = async (req: Request, res: Response) => {
  try {
    const { nom, prenom, filiation, numero_piece, type_piece } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const photo = files?.photo?.[0]?.buffer;
    const piece_identite = files?.piece_identite?.[0]?.buffer;
    const signature = files?.signature?.[0]?.buffer;
    const donnees_biometriques = files?.donnees_biometriques?.[0]?.buffer;

    const result = await db.query(
      `INSERT INTO contrevenants 
       (nom, prenom, filiation, photo, piece_identite, numero_piece, type_piece, signature, donnees_biometriques)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nom, prenom, filiation, photo, piece_identite, numero_piece, type_piece, signature, donnees_biometriques]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la création du contrevenant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateContrevenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nom, prenom, filiation, numero_piece, type_piece } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const photo = files?.photo?.[0]?.buffer;
    const piece_identite = files?.piece_identite?.[0]?.buffer;
    const signature = files?.signature?.[0]?.buffer;
    const donnees_biometriques = files?.donnees_biometriques?.[0]?.buffer;

    let query = `UPDATE contrevenants 
                 SET nom = $1, prenom = $2, filiation = $3, numero_piece = $4, type_piece = $5`;
    const params: any[] = [nom, prenom, filiation, numero_piece, type_piece];
    let paramIndex = 6;

    if (photo) {
      query += `, photo = $${paramIndex}`;
      params.push(photo);
      paramIndex++;
    }
    if (piece_identite) {
      query += `, piece_identite = $${paramIndex}`;
      params.push(piece_identite);
      paramIndex++;
    }
    if (signature) {
      query += `, signature = $${paramIndex}`;
      params.push(signature);
      paramIndex++;
    }
    if (donnees_biometriques) {
      query += `, donnees_biometriques = $${paramIndex}`;
      params.push(donnees_biometriques);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contrevenant non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteContrevenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM contrevenants WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contrevenant non trouvé' });
    }

    res.json({ message: 'Contrevenant supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 🚨 INFRACTIONS
// =====================================================

export const getInfractions = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT i.*, 
              ci.code, ci.nature,
              l.region, l.departement, l.commune,
              av.nom as agent_nom, av.prenom as agent_prenom,
              array_agg(json_build_object(
                'id', c.id,
                'nom', c.nom,
                'prenom', c.prenom,
                'numero_piece', c.numero_piece
              )) as contrevenants
       FROM infractions i
       LEFT JOIN code_infractions ci ON i.code_infraction_id = ci.id
       LEFT JOIN lieux l ON i.lieu_id = l.id
       LEFT JOIN agents_verbalisateurs av ON i.agent_id = av.id
       LEFT JOIN contrevenants_infractions ci2 ON i.id = ci2.infraction_id
       LEFT JOIN contrevenants c ON ci2.contrevenant_id = c.id
       GROUP BY i.id, ci.code, ci.nature, l.region, l.departement, l.commune, av.nom, av.prenom
       ORDER BY i.date_infraction DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des infractions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createInfraction = async (req: Request, res: Response) => {
  try {
    const {
      code_infraction_id,
      date_infraction,
      agent_id,
      montant_chiffre,
      numero_quittance,
      observations,
      region,
      departement,
      commune,
      arrondissement,
      latitude,
      longitude,
      contrevenants
    } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const photo_quittance = files?.photo_quittance?.[0]?.buffer;
    const photo_infraction = files?.photo_infraction?.[0]?.buffer;

    // Créer le lieu
    const lieuResult = await pgdb.query(
      `INSERT INTO lieux (region, departement, commune, arrondissement, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [region, departement, commune, arrondissement, latitude, longitude]
    );
    const lieu_id = lieuResult.rows[0].id;

    // Créer l'infraction
    const infractionResult = await pgdb.query(
      `INSERT INTO infractions 
       (code_infraction_id, lieu_id, date_infraction, agent_id, montant_chiffre, 
        numero_quittance, photo_quittance, photo_infraction, observations)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [code_infraction_id, lieu_id, date_infraction, agent_id, montant_chiffre,
       numero_quittance, photo_quittance, photo_infraction, observations]
    );

    const infraction_id = infractionResult.rows[0].id;

    // Associer les contrevenants
    if (contrevenants && Array.isArray(contrevenants)) {
      for (const contrevenant_id of contrevenants) {
        await pgdb.query(
          `INSERT INTO contrevenants_infractions (contrevenant_id, infraction_id)
           VALUES ($1, $2)`,
          [contrevenant_id, infraction_id]
        );
      }
    }

    res.status(201).json(infractionResult.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la création de l\'infraction:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      code_infraction_id,
      date_infraction,
      agent_id,
      montant_chiffre,
      numero_quittance,
      observations
    } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const photo_quittance = files?.photo_quittance?.[0]?.buffer;
    const photo_infraction = files?.photo_infraction?.[0]?.buffer;

    let query = `UPDATE infractions 
                 SET code_infraction_id = $1, date_infraction = $2, agent_id = $3, 
                     montant_chiffre = $4, numero_quittance = $5, observations = $6,
                     updated_at = CURRENT_TIMESTAMP`;
    const params: any[] = [code_infraction_id, date_infraction, agent_id, 
                           montant_chiffre, numero_quittance, observations];
    let paramIndex = 7;

    if (photo_quittance) {
      query += `, photo_quittance = $${paramIndex}`;
      params.push(photo_quittance);
      paramIndex++;
    }
    if (photo_infraction) {
      query += `, photo_infraction = $${paramIndex}`;
      params.push(photo_infraction);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Infraction non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM infractions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Infraction non trouvée' });
    }

    res.json({ message: 'Infraction supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📄 PROCÈS-VERBAUX
// =====================================================

export const getProcesVerbaux = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT pv.*, 
              i.date_infraction, i.montant_chiffre,
              ci.code, ci.nature,
              l.region, l.departement
       FROM proces_verbaux pv
       LEFT JOIN infractions i ON pv.infraction_id = i.id
       LEFT JOIN code_infractions ci ON i.code_infraction_id = ci.id
       LEFT JOIN lieux l ON i.lieu_id = l.id
       ORDER BY pv.date_generation DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des PV:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createProcesVerbal = async (req: Request, res: Response) => {
  try {
    const { infraction_id, numero_pv } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const fichier_pv = files?.fichier_pv?.[0]?.buffer;
    const piece_jointe = files?.piece_jointe?.[0]?.buffer;
    const nom_piece_jointe = files?.piece_jointe?.[0]?.originalname;

    const result = await db.query(
      `INSERT INTO proces_verbaux (infraction_id, numero_pv, fichier_pv, piece_jointe, nom_piece_jointe)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [infraction_id, numero_pv, fichier_pv, piece_jointe, nom_piece_jointe]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création du PV:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce numéro de PV existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const deleteProcesVerbal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM proces_verbaux WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'PV non trouvé' });
    }

    res.json({ message: 'PV supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📊 STATISTIQUES
// =====================================================

export const getStatistiques = async (req: Request, res: Response) => {
  try {
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM infractions) as total_infractions,
        (SELECT COUNT(*) FROM contrevenants) as total_contrevenants,
        (SELECT COUNT(*) FROM proces_verbaux) as total_pv,
        (SELECT COALESCE(SUM(montant_chiffre), 0) FROM infractions) as montant_total,
        (SELECT COUNT(*) FROM infractions WHERE date_infraction >= NOW() - INTERVAL '30 days') as infractions_30j
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

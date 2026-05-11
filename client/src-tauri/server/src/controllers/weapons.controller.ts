import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WeaponsController {
  public getWeaponTypes = async (req: Request, res: Response): Promise<void> => {
    try {
      // Le modèle 'weapon_type' existe, donc prisma.weaponType est correct.
      const weaponTypes = await prisma.weaponType.findMany({
        select: { id: true, name: true }, // 'name' est le champ pour le libellé dans le modèle weapon_type
      });
      res.status(200).json(weaponTypes.map(wt => ({ id: wt.id.toString(), value: wt.name, label: wt.name })));
    } catch (error) {
      console.error('Error fetching weapon types:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des types d\'armes', error: (error as Error).message });
    }
  };

  public getWeaponBrands = async (req: Request, res: Response): Promise<void> => {
    try {
      // Pas de table dédiée 'weapon_brand', on récupère les valeurs distinctes de la table 'hunters'
      const distinctBrands = await prisma.hunters.findMany({
        where: {
          weapon_brand: {
            not: null, // Exclure les valeurs nulles
            not: '',   // Exclure les chaînes vides si nécessaire
          },
        },
        select: {
          weapon_brand: true,
        },
        distinct: ['weapon_brand'],
      });
      // Le frontend attend { id: string, value: string, label: string }
      // Comme il n'y a pas d'ID dédié, on utilise la valeur de la marque comme id et value.
      res.status(200).json(distinctBrands.map(b => ({ 
        id: b.weapon_brand!,
        value: b.weapon_brand!,
        label: b.weapon_brand! 
      })));
    } catch (error) {
      console.error('Error fetching weapon brands:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des marques d\'armes', error: (error as Error).message });
    }
  };

  public getWeaponCalibers = async (req: Request, res: Response): Promise<void> => {
    try {
      // Pas de table dédiée 'weapon_caliber', on récupère les valeurs distinctes de la table 'hunters'
      const distinctCalibers = await prisma.hunters.findMany({
        where: {
          weapon_caliber: {
            not: null, // Exclure les valeurs nulles
            not: '',   // Exclure les chaînes vides si nécessaire
          },
        },
        select: {
          weapon_caliber: true,
        },
        distinct: ['weapon_caliber'],
      });
      // Le frontend attend { id: string, value: string, label: string }
      // Comme il n'y a pas d'ID dédié, on utilise la valeur du calibre comme id et value.
      res.status(200).json(distinctCalibers.map(c => ({ 
        id: c.weapon_caliber!,
        value: c.weapon_caliber!,
        label: c.weapon_caliber! 
      })));
    } catch (error) {
      console.error('Error fetching weapon calibers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des calibres d\'armes', error: (error as Error).message });
    }
  };
}

// server/src/services/weapon.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeaponType } from '../entities/weapon-type.entity';
import { WeaponBrand } from '../entities/weapon-brand.entity';
import { WeaponCaliber } from '../entities/weapon-caliber.entity';

@Injectable()
export class WeaponService {
  constructor(
    @InjectRepository(WeaponType)
    private weaponTypeRepository: Repository<WeaponType>,
    
    @InjectRepository(WeaponBrand)
    private weaponBrandRepository: Repository<WeaponBrand>,
    
    @InjectRepository(WeaponCaliber)
    private weaponCaliberRepository: Repository<WeaponCaliber>,
  ) {}

  async getAllWeaponTypes(status?: 'active' | 'inactive'): Promise<WeaponType[]> {
    const where: any = {};
    if (status) {
      where.isActive = status === 'active';
    }
    return this.weaponTypeRepository.find({ where, order: { label: 'ASC' } });
  }

  async getWeaponBrandsByType(typeId: string, status?: 'active' | 'inactive'): Promise<WeaponBrand[]> {
    const where: any = { weaponType: { id: typeId } };
    if (status) {
      where.isActive = status === 'active';
    }
    return this.weaponBrandRepository.find({ where, order: { label: 'ASC' } });
  }

  async getWeaponCalibersByType(typeId: string, status?: 'active' | 'inactive'): Promise<WeaponCaliber[]> {
    const where: any = { weaponType: { id: typeId } };
    if (status) {
      where.isActive = status === 'active';
    }
    return this.weaponCaliberRepository.find({ where, order: { label: 'ASC' } });
  }

  async createWeaponType(weaponType: Partial<WeaponType>): Promise<WeaponType> {
    const newWeaponType = this.weaponTypeRepository.create(weaponType);
    return this.weaponTypeRepository.save(newWeaponType);
  }

  async updateWeaponType(id: string, weaponType: Partial<WeaponType>): Promise<WeaponType> {
    const existingType = await this.weaponTypeRepository.findOne({ where: { id } });
    if (!existingType) {
      throw new NotFoundException(`Type d'arme avec l'ID ${id} non trouvé`);
    }
    Object.assign(existingType, weaponType);
    return this.weaponTypeRepository.save(existingType);
  }

  async createWeaponBrand(weaponBrand: Partial<WeaponBrand>): Promise<WeaponBrand> {
    const newWeaponBrand = this.weaponBrandRepository.create(weaponBrand);
    return this.weaponBrandRepository.save(newWeaponBrand);
  }

  async updateWeaponBrand(id: string, weaponBrand: Partial<WeaponBrand>): Promise<WeaponBrand> {
    const existingBrand = await this.weaponBrandRepository.findOne({ where: { id } });
    if (!existingBrand) {
      throw new NotFoundException(`Marque d'arme avec l'ID ${id} non trouvée`);
    }
    Object.assign(existingBrand, weaponBrand);
    return this.weaponBrandRepository.save(existingBrand);
  }

  async createWeaponCaliber(weaponCaliber: Partial<WeaponCaliber>): Promise<WeaponCaliber> {
    const newWeaponCaliber = this.weaponCaliberRepository.create(weaponCaliber);
    return this.weaponCaliberRepository.save(newWeaponCaliber);
  }

  async updateWeaponCaliber(id: string, weaponCaliber: Partial<WeaponCaliber>): Promise<WeaponCaliber> {
    const existingCaliber = await this.weaponCaliberRepository.findOne({ where: { id } });
    if (!existingCaliber) {
      throw new NotFoundException(`Calibre d'arme avec l'ID ${id} non trouvé`);
    }
    Object.assign(existingCaliber, weaponCaliber);
    return this.weaponCaliberRepository.save(existingCaliber);
  }
}
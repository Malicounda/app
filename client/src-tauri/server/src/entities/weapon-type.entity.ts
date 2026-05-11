// server/src/entities/weapon-type.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { WeaponBrand } from './weapon-brand.entity';
import { WeaponCaliber } from './weapon-caliber.entity';

@Entity('weapon_types')
export class WeaponType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  label: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WeaponBrand, brand => brand.weaponType)
  brands: WeaponBrand[];

  @OneToMany(() => WeaponCaliber, caliber => caliber.weaponType)
  calibers: WeaponCaliber[];
}
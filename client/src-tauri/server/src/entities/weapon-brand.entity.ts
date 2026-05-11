import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { WeaponType } from './weapon-type.entity';

@Entity('weapon_brands')
export class WeaponBrand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  label: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => WeaponType, type => type.brands)
  weaponType: WeaponType;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

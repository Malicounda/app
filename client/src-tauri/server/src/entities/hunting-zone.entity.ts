import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { Region } from './region.entity';
import { HuntingPermit } from './hunting-permit.entity';
import { HuntingReport } from './hunting-report.entity';

@Entity('hunting_zones')
export class HuntingZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  name: string;

  @Column({ type: 'text', nullable: true })
  @IsString({ message: 'La description doit être une chaîne de caractères' })
  @IsOptional()
  description?: string;

  @Column({ type: 'uuid' })
  @IsNotEmpty({ message: 'La région est obligatoire' })
  regionId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @IsNumber({}, { message: 'La superficie doit être un nombre' })
  @Min(0, { message: 'La superficie ne peut pas être négative' })
  area: number; // en hectares

  @Column({ type: 'jsonb', nullable: true })
  @IsOptional()
  boundaries?: any; // Stockage des coordonnées géographiques

  @Column({ default: true })
  @IsBoolean({ message: 'Le statut actif doit être un booléen' })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Region, (region) => region.huntingZones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regionId' })
  region: Region;

  @OneToMany(() => HuntingPermit, (permit) => permit.zone)
  huntingPermits: HuntingPermit[];

  @OneToMany(() => HuntingReport, (report) => report.zone)
  huntingReports: HuntingReport[];

  // Méthodes utilitaires
  toJSON() {
    return this;
  }
}

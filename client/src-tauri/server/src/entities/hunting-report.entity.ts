import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, IsDate, IsUUID, IsEnum } from 'class-validator';
import { User } from './user.entity.js';
import { HuntingZone } from './hunting-zone.entity.js';
import { HuntingPermit } from './hunting-permit.entity.js';
import { Species } from './species.entity.js';

export enum ReportStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  VALIDATED = 'validated',
  REJECTED = 'rejected'
}

@Entity('hunting_reports')
export class HuntingReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  @IsUUID(4, { message: 'ID de chasseur invalide' })
  @IsNotEmpty({ message: 'Le chasseur est obligatoire' })
  hunterId!: string;

  @Column({ type: 'uuid' })
  @IsUUID(4, { message: 'ID de zone de chasse invalide' })
  @IsNotEmpty({ message: 'La zone de chasse est obligatoire' })
  zoneId!: string;

  @Column({ type: 'uuid', nullable: true })
  @IsUUID(4, { message: 'ID de permis invalide' })
  @IsOptional()
  permitId?: string;

  @Column({ type: 'uuid' })
  @IsUUID(4, { message: 'ID d\'espèce invalide' })
  @IsNotEmpty({ message: 'L\'espèce est obligatoire' })
  speciesId!: string;

  @Column({ type: 'date' })
  @IsDate({ message: 'Date de chasse invalide' })
  @IsNotEmpty({ message: 'La date de chasse est obligatoire' })
  huntingDate!: Date;

  @Column({ type: 'int' })
  @IsNumber({}, { message: 'La quantité doit être un nombre' })
  @Min(1, { message: 'La quantité doit être supérieure à 0' })
  quantity!: number;

  @Column({ type: 'jsonb', nullable: true })
  @IsOptional()
  location?: any; // Coordonnées géographiques

  @Column({ type: 'text', nullable: true })
  @IsString({ message: 'Les notes doivent être une chaîne de caractères' })
  @IsOptional()
  notes?: string;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.DRAFT })
  @IsEnum(ReportStatus, { message: 'Statut de rapport invalide' })
  status!: ReportStatus;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.huntingReports, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hunterId' })
  hunter!: User;

  @ManyToOne(() => HuntingZone, (zone) => zone.huntingReports, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zoneId' })
  zone!: HuntingZone;

  @ManyToOne(() => HuntingPermit, (permit) => permit.huntingReports, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'permitId' })
  permit?: HuntingPermit;

  @ManyToOne(() => Species, (species) => species.huntingReports, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'speciesId' })
  species!: Species;

  // Méthodes utilitaires
  toJSON() {
    return this;
  }
}
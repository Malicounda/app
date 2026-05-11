import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { IsNotEmpty, IsString, IsOptional, IsDate, IsUUID, IsEnum } from 'class-validator';
import { User } from './user.entity.js'; // Assurez-vous que user.entity.ts existe et exporte User
import { HuntingReport } from './hunting-report.entity.js';

export enum PermitStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Entity('hunting_permits')
export class HuntingPermit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  @IsNotEmpty({ message: 'Le numéro de permis est obligatoire' })
  @IsString({ message: 'Le numéro de permis doit être une chaîne de caractères' })
  permitNumber!: string;

  @Column({ type: 'uuid' })
  @IsUUID(4, { message: 'ID utilisateur invalide' })
  @IsNotEmpty({ message: 'L\'utilisateur est obligatoire' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.huntingPermits, { onDelete: 'CASCADE' }) // Assurez-vous que User a une propriété huntingPermits
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'date' })
  @IsDate({ message: 'Date de délivrance invalide' })
  @IsNotEmpty({ message: 'La date de délivrance est obligatoire' })
  issueDate!: Date;

  @Column({ type: 'date' })
  @IsDate({ message: 'Date d\'expiration invalide' })
  @IsNotEmpty({ message: 'La date d\'expiration est obligatoire' })
  expiryDate!: Date;
  
  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  permitType?: string;

  @Column({
    type: 'enum',
    enum: PermitStatus,
    default: PermitStatus.ACTIVE,
  })
  @IsEnum(PermitStatus)
  @IsNotEmpty()
  status!: PermitStatus;

  @OneToMany(() => HuntingReport, (report) => report.permit)
  huntingReports!: HuntingReport[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

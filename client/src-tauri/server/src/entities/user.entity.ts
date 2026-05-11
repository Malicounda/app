import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate, OneToMany } from 'typeorm';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsEnum, IsBoolean } from 'class-validator';
import { Exclude } from 'class-transformer';
import * as bcrypt from 'bcrypt';

// Rôles des utilisateurs
export enum UserRole {
  ADMIN = 'admin',
  REGIONAL_AGENT = 'regional_agent',
  SECTOR_AGENT = 'sector_agent',
  AGENT = 'agent',
  HUNTER = 'hunter',
  GUIDE = 'guide',
  OBSERVER = 'observer',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'L\'email est obligatoire' })
  email!: string;

  @Column({ unique: true })
  @IsString({ message: 'Le nom d\'utilisateur doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom d\'utilisateur est obligatoire' })
  username!: string;

  @Column()
  @Exclude({ toPlainOnly: true })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password!: string;

  @Column()
  @IsString({ message: 'Le prénom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le prénom est obligatoire' })
  firstName!: string;

  @Column()
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  lastName!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.HUNTER })
  @IsEnum(UserRole, { message: 'Rôle utilisateur invalide' })
  role!: UserRole;

  @Column({ nullable: true })
  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères' })
  @IsOptional()
  phone?: string;

  @Column({ default: true })
  @IsBoolean({ message: 'Le statut actif doit être un booléen' })
  isActive!: boolean;

  @Column({ nullable: true })
  @IsString({ message: 'Le jeton de réinitialisation doit être une chaîne de caractères' })
  @Exclude({ toPlainOnly: true })
  resetPasswordToken?: string;

  @Column({ nullable: true, type: 'timestamp' })
  @Exclude({ toPlainOnly: true })
  resetPasswordExpires?: Date;

  @Column({ nullable: true, type: 'timestamp' })
  @Exclude({ toPlainOnly: true })
  lastLogin?: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @Column({ type: 'int', nullable: true })
  @IsOptional()
  hunter_id?: number;

  // Relations
  @OneToMany(() => HuntingPermit, (permit) => permit.user)
  huntingPermits!: HuntingPermit[];

  @OneToMany(() => HuntingReport, (report) => report.hunter)
  huntingReports!: HuntingReport[];

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password) {
      const salt = await bcrypt.genSalt();
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  // Méthodes utilitaires
  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  // Méthode pour masquer les champs sensibles lors de la sérialisation
  toJSON() {
    const { password, resetPasswordToken, resetPasswordExpires, ...user } = this;
    return user;
  }
}

// Importations des entités liées pour éviter les références circulaires
import { HuntingPermit } from './hunting-permit.entity.js';
import { HuntingReport } from './hunting-report.entity.js';

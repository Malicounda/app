import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { HuntingReport } from './hunting-report.entity.js';

@Entity('species')
export class Species {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @IsNotEmpty({ message: 'Le nom de l\'espèce est obligatoire' })
  @IsString({ message: 'Le nom de l\'espèce doit être une chaîne de caractères' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères' })
  description?: string;

  @OneToMany(() => HuntingReport, (report) => report.species)
  huntingReports!: HuntingReport[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

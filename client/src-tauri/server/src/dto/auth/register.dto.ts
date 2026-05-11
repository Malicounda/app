import { IsString, IsEmail, MinLength, IsEnum, IsOptional, IsBoolean, IsNumber, IsNotEmpty, Min, Matches } from 'class-validator';
import { UserRole } from '../../enums/user-role.enum';
import { ApiProperty } from '@nestjs/swagger';

// Initialisation des propriétés
export class RegisterUserDto {
  @ApiProperty({
    description: 'Nom d\'utilisateur',
    example: 'john_doe',
    required: true,
    minLength: 3,
  })
  @IsString({ message: 'Le nom d\'utilisateur est requis' })
  @MinLength(3, { message: 'Le nom d\'utilisateur doit contenir au moins 3 caractères' })
  username: string = '';

  @ApiProperty({
    description: 'Adresse email',
    example: 'john@example.com',
    required: true,
  })
  @IsEmail({}, { message: 'Email invalide' })
  email: string = '';

  @ApiProperty({
    description: 'Mot de passe',
    example: 'password123',
    required: true,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string = '';

  @ApiProperty({
    description: 'Confirmation du mot de passe',
    example: 'password123',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'La confirmation du mot de passe est requise' })
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/, {
    message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial'
  })
  confirmPassword: string = '';

  @ApiProperty({
    description: 'Prénom',
    example: 'John',
    required: true,
    minLength: 2,
  })
  @IsString({ message: 'Le prénom est requis' })
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le prénom ne doit contenir que des lettres' })
  firstName: string = '';

  @ApiProperty({
    description: 'Nom',
    example: 'Doe',
    required: true,
    minLength: 2,
  })
  @IsString({ message: 'Le nom est requis' })
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le nom ne doit contenir que des lettres' })
  lastName: string = '';

  @ApiProperty({
    description: 'Rôle utilisateur',
    example: 'hunter',
    enum: UserRole,
    required: true,
  })
  @IsEnum(UserRole, { message: 'Rôle utilisateur invalide' })
  role: UserRole = UserRole.HUNTER;

  @ApiProperty({
    description: 'Numéro de téléphone',
    example: '+221 77 123 45 67',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+221\s?[0-9]{2}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}$/, {
    message: 'Format de téléphone invalide (ex: +221 77 123 45 67)'
  })
  phone?: string;

  @ApiProperty({
    description: 'Numéro d\'identité',
    example: '123456789',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro d\'identité est requis' })
  idNumber: string = '';

  @ApiProperty({
    description: 'Pays',
    example: 'Sénégal',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Le pays est requis' })
  pays: string = '';

  @ApiProperty({
    description: 'Adresse',
    example: '123 Rue de Paris',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'L\'adresse est requise' })
  address: string = '';

  @ApiProperty({
    description: 'Date de naissance',
    example: '1990-01-01',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'La date de naissance est requise' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format de date invalide (ex: YYYY-MM-DD)'
  })
  dateOfBirth: string = '';

  @ApiProperty({
    description: 'Profession',
    example: 'Ingénieur',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'La profession est requise' })
  @Matches(/^[A-Za-zÀ-ž\s\-]+$/, {
    message: 'La profession ne doit contenir que des lettres, espaces et tirets'
  })
  profession: string = '';

  @ApiProperty({
    description: 'Expérience',
    example: 5,
    required: true,
  })
  @IsNumber()
  @IsNotEmpty({ message: 'L\'expérience est requise' })
  @Min(0, { message: 'L\'expérience doit être un nombre positif' })
  experience: number = 0;

  @ApiProperty({
    description: 'Catégorie',
    example: 'resident',
    required: true,
    enum: ['resident', 'touristique'],
  })
  @IsEnum(['resident', 'touristique'], { message: 'Catégorie invalide' })
  category: 'resident' | 'touristique' = 'resident';

  @ApiProperty({
    description: 'Prénom du tuteur (si mineur)',
    example: 'Jane',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le prénom du tuteur ne doit contenir que des lettres' })
  tutorFirstName?: string;

  @ApiProperty({
    description: 'Nom du tuteur (si mineur)',
    example: 'Smith',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le nom du tuteur ne doit contenir que des lettres' })
  tutorLastName?: string;

  @ApiProperty({
    description: 'Numéro d\'identité du tuteur',
    example: '987654321',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le numéro d\'identité du tuteur est requis' })
  tutorIdNumber?: string;

  @ApiProperty({
    description: 'Numéro de téléphone du tuteur',
    example: '+221 78 987 65 43',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+221\s?[0-9]{2}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}$/, {
    message: 'Format de téléphone du tuteur invalide (ex: +221 77 123 45 67)'
  })
  tutorPhone?: string;

  @ApiProperty({
    description: 'Confirmation de la lettre de responsabilité',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  letterConfirmation?: boolean;
}

export class RegisterUserDto {
  @ApiProperty({
    description: 'Nom d\'utilisateur',
    example: 'john_doe',
    required: true,
    minLength: 3,
  })
  @IsString({ message: 'Le nom d\'utilisateur est requis' })
  @MinLength(3, { message: 'Le nom d\'utilisateur doit contenir au moins 3 caractères' })
  username: string;

  @ApiProperty({
    description: 'Adresse email',
    example: 'john@example.com',
    required: true,
  })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({
    description: 'Mot de passe',
    example: 'password123',
    required: true,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;

  @ApiProperty({
    description: 'Confirmation du mot de passe',
    example: 'password123',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'La confirmation du mot de passe est requise' })
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/, {
    message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial'
  })
  confirmPassword: string;

  @ApiProperty({
    description: 'Prénom',
    example: 'John',
    required: true,
    minLength: 2,
  })
  @IsString({ message: 'Le prénom est requis' })
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le prénom ne doit contenir que des lettres' })
  firstName: string;

  @ApiProperty({
    description: 'Nom',
    example: 'Doe',
    required: true,
    minLength: 2,
  })
  @IsString({ message: 'Le nom est requis' })
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le nom ne doit contenir que des lettres' })
  lastName: string;

  @ApiProperty({
    description: 'Rôle utilisateur',
    example: 'hunter',
    enum: UserRole,
    required: true,
  })
  @IsEnum(UserRole, { message: 'Rôle utilisateur invalide' })
  role: UserRole;

  @ApiProperty({
    description: 'Numéro de téléphone',
    example: '+221 77 123 45 67',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+221\s?[0-9]{2}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}$/, {
    message: 'Format de téléphone invalide (ex: +221 77 123 45 67)'
  })
  phone?: string;

  @ApiProperty({
    description: 'Numéro d\'identité',
    example: '123456789',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro d\'identité est requis' })
  idNumber: string;

  @ApiProperty({
    description: 'Pays',
    example: 'Sénégal',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Le pays est requis' })
  pays: string;

  @ApiProperty({
    description: 'Adresse',
    example: '123 Rue de Paris',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'L\'adresse est requise' })
  address: string;

  @ApiProperty({
    description: 'Date de naissance',
    example: '1990-01-01',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'La date de naissance est requise' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format de date invalide (ex: YYYY-MM-DD)'
  })
  dateOfBirth: string;

  @ApiProperty({
    description: 'Profession',
    example: 'Ingénieur',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'La profession est requise' })
  @Matches(/^[A-Za-zÀ-ž\s\-]+$/, {
    message: 'La profession ne doit contenir que des lettres, espaces et tirets'
  })
  profession: string;

  @ApiProperty({
    description: 'Expérience',
    example: 5,
    required: true,
  })
  @IsNumber()
  @IsNotEmpty({ message: 'L\'expérience est requise' })
  @Min(0, { message: 'L\'expérience doit être un nombre positif' })
  experience: number;

  @ApiProperty({
    description: 'Catégorie',
    example: 'resident',
    required: true,
    enum: ['resident', 'touristique'],
  })
  @IsEnum(['resident', 'touristique'], { message: 'Catégorie invalide' })
  category: 'resident' | 'touristique';

  @ApiProperty({
    description: 'Prénom du tuteur (si mineur)',
    example: 'Jane',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le prénom du tuteur ne doit contenir que des lettres' })
  tutorFirstName?: string;

  @ApiProperty({
    description: 'Nom du tuteur (si mineur)',
    example: 'Smith',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-zÀ-ž]+$/, { message: 'Le nom du tuteur ne doit contenir que des lettres' })
  tutorLastName?: string;

  @ApiProperty({
    description: 'Numéro d\'identité du tuteur',
    example: '987654321',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le numéro d\'identité du tuteur est requis' })
  tutorIdNumber?: string;

  @ApiProperty({
    description: 'Numéro de téléphone du tuteur',
    example: '+221 78 987 65 43',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+221\s?[0-9]{2}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}$/, {
    message: 'Format de téléphone du tuteur invalide (ex: +221 77 123 45 67)'
  })
  tutorPhone?: string;

  @ApiProperty({
    description: 'Confirmation de la lettre de responsabilité',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  letterConfirmation?: boolean;
}



export class LoginUserDto {
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @IsString()
  password: string;
}
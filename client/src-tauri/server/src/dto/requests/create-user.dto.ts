import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { UserRole } from '../../entities/user.entity';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'L\'email est obligatoire' })
  email: string;

  @IsString({ message: 'Le nom d\'utilisateur doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom d\'utilisateur est obligatoire' })
  username: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;

  @IsString({ message: 'Le prénom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le prénom est obligatoire' })
  firstName: string;

  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  lastName: string;

  @IsEnum(UserRole, { message: 'Rôle utilisateur invalide' })
  @IsOptional()
  role?: UserRole;

  @IsString({ message: 'Le numéro de téléphone doit être une chaîne de caractères' })
  @IsOptional()
  phone?: string;
}
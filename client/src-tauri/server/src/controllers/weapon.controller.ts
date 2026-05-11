// server/src/controllers/weapon.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { WeaponService } from '../services/weapon.service';
import { WeaponType } from '../entities/weapon-type.entity';
import { WeaponBrand } from '../entities/weapon-brand.entity';
import { WeaponCaliber } from '../entities/weapon-caliber.entity';

@Controller('api/weapons')
export class WeaponController {
  constructor(private readonly weaponService: WeaponService) {}

  @Get('types')
  async getWeaponTypes(@Query('status') status?: 'active' | 'inactive'): Promise<WeaponType[]> {
    return this.weaponService.getAllWeaponTypes(status);
  }

  @Get('brands')
  async getWeaponBrands(
    @Query('typeId') typeId: string,
    @Query('status') status?: 'active' | 'inactive'
  ): Promise<WeaponBrand[]> {
    return this.weaponService.getWeaponBrandsByType(typeId, status);
  }

  @Get('calibers')
  async getWeaponCalibers(
    @Query('typeId') typeId: string,
    @Query('status') status?: 'active' | 'inactive'
  ): Promise<WeaponCaliber[]> {
    return this.weaponService.getWeaponCalibersByType(typeId, status);
  }

  @Post('types')
  async createWeaponType(@Body() weaponType: Partial<WeaponType>): Promise<WeaponType> {
    return this.weaponService.createWeaponType(weaponType);
  }

  @Put('types/:id')
  async updateWeaponType(
    @Param('id') id: string,
    @Body() weaponType: Partial<WeaponType>
  ): Promise<WeaponType> {
    return this.weaponService.updateWeaponType(id, weaponType);
  }

  @Post('brands')
  async createWeaponBrand(@Body() weaponBrand: Partial<WeaponBrand>): Promise<WeaponBrand> {
    return this.weaponService.createWeaponBrand(weaponBrand);
  }

  @Put('brands/:id')
  async updateWeaponBrand(
    @Param('id') id: string,
    @Body() weaponBrand: Partial<WeaponBrand>
  ): Promise<WeaponBrand> {
    return this.weaponService.updateWeaponBrand(id, weaponBrand);
  }

  @Post('calibers')
  async createWeaponCaliber(@Body() weaponCaliber: Partial<WeaponCaliber>): Promise<WeaponCaliber> {
    return this.weaponService.createWeaponCaliber(weaponCaliber);
  }

  @Put('calibers/:id')
  async updateWeaponCaliber(
    @Param('id') id: string,
    @Body() weaponCaliber: Partial<WeaponCaliber>
  ): Promise<WeaponCaliber> {
    return this.weaponService.updateWeaponCaliber(id, weaponCaliber);
  }
}
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Permit } from '../entities/permit.entity';
import { SlaughterTax } from '../entities/slaughter-tax.entity';
import { Campaign } from '../entities/campaign.entity';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Permit)
    private readonly permitRepository: Repository<Permit>,
    @InjectRepository(SlaughterTax)
    private readonly slaughterTaxRepository: Repository<SlaughterTax>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  async getRegionalStats(region: string) {
    const [
      registeredHunters,
      activePermits,
      totalPermits,
      permitRevenue,
      issuedPermits,
      slaughterTaxes,
      currentCampaign,
      recentPermits,
    ] = await Promise.all([
      // Nombre de chasseurs enregistrés dans la région
      this.userRepository.count({
        where: { region, role: 'hunter' },
      }),

      // Nombre de permis actifs
      this.permitRepository.count({
        where: { region, status: 'approved', is_active: true },
      }),

      // Nombre total de permis
      this.permitRepository.count({
        where: { region },
      }),

      // Revenus des permis
      this.permitRepository
        .createQueryBuilder('permit')
        .where('permit.region = :region', { region })
        .andWhere('permit.status = :status', { status: 'approved' })
        .select('SUM(permit.amount)', 'total')
        .getRawOne(),

      // Nombre de permis délivrés
      this.permitRepository.count({
        where: { region, status: 'approved' },
      }),

      // Taxes d'abattage
      this.slaughterTaxRepository
        .createQueryBuilder('tax')
        .where('tax.region = :region', { region })
        .select('SUM(tax.amount)', 'total')
        .addSelect('COUNT(*)', 'count')
        .getRawOne(),

      // Campagne active
      this.campaignRepository.findOne({
        where: { is_active: true },
        order: { created_at: 'DESC' },
      }),

      // Permis récents
      this.permitRepository.find({
        where: { region },
        order: { updated_at: 'DESC' },
        take: 5,
      }),
    ]);

    return {
      registeredHunters,
      activePermits,
      activePermitsPercentage: totalPermits > 0 
        ? Math.round((activePermits / totalPermits) * 100) 
        : 0,
      permitRevenue: permitRevenue?.total || 0,
      issuedPermits,
      slaughterTax: slaughterTaxes?.total || 0,
      registeredTaxes: slaughterTaxes?.count || 0,
      currentCampaign,
      recentPermits,
    };
  }
}

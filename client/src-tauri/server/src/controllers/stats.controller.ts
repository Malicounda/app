import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from '../services/stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('stats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('regional')
  @Roles('agent_regional')
  async getRegionalStats(@Query('region') region: string) {
    return this.statsService.getRegionalStats(region);
  }
}

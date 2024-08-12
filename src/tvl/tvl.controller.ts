import { Controller, Get, Logger } from '@nestjs/common';
import { TvlService } from './tvl.service';

@Controller('tvl')
export class TvlController {
  private readonly logger = new Logger(TvlController.name);

  constructor(private readonly tvlService: TvlService) {}

  @Get('latest')
  async getLatestTvl() {
    try {
      const latestTvl = await this.tvlService.getLatestTvl();
      if (latestTvl) {
        return {
          totalValueUsd: latestTvl.value,
          lastUpdated: latestTvl.calculated_at,
        };
      } else {
        return { error: 'TVL data not available' };
      }
    } catch (error) {
      this.logger.error('Error fetching latest TVL', error);
      return { error: 'Error fetching TVL' };
    }
  }

  @Get('update')
  async updateTvl() {
    try {
      await this.tvlService.updateTvl();
      return { message: 'TVL update initiated' };
    } catch (error) {
      this.logger.error('Error initiating TVL update', error);
      return { error: 'Error initiating TVL update' };
    }
  }
}

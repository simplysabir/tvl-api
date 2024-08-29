import { Controller, Get, Param, Logger } from '@nestjs/common';
import { TvlService } from './tvl.service';

@Controller('tvl')
export class TvlController {
  private readonly logger = new Logger(TvlController.name);

  constructor(private readonly tvlService: TvlService) {}

  @Get('latest')
  async getLatestAllTvl() {
    try {
      const totalValueUsd = await this.tvlService.getLatestAllTvl();
      if (totalValueUsd !== null) {
        return { totalValueUsd };
      } else {
        return { error: 'TVL data not available' };
      }
    } catch (error) {
      this.logger.error('Error fetching latest total TVL', error);
      return { error: 'Error fetching TVL' };
    }
  }

  @Get('update')
  async updateAllTvl() {
    try {
      const totalValueUsd = await this.tvlService.updateAllTvl();
      return { message: 'Total TVL updated successfully', totalValueUsd };
    } catch (error) {
      this.logger.error('Error updating total TVL', error);
      return { error: 'Error updating TVL' };
    }
  }

  @Get('latest/:governanceId')
  async getTvlByGovernanceId(@Param('governanceId') governanceId: string) {
    try {
      const totalValue = await this.tvlService.calculateTvlForDao(governanceId);
      return {
        daoGovernanceProgramId: governanceId,
        totalValue: totalValue.toFixed(2),
      };
    } catch (error) {
      this.logger.error(
        `Error fetching TVL for governance ID ${governanceId}`,
        error,
      );
      return { error: 'Error fetching TVL' };
    }
  }
}

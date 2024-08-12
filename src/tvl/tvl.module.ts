import { Module } from '@nestjs/common';
import { TvlService } from './tvl.service';
import { TvlController } from './tvl.controller';
import { DatabaseService } from 'src/database/database.service';

@Module({
  providers: [TvlService, DatabaseService],
  controllers: [TvlController],
})
export class TvlModule {}

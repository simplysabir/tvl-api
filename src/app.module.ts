import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { TvlModule } from './tvl/tvl.module';

@Module({
  imports: [DatabaseModule, TvlModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

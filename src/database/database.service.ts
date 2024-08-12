import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import configuration from 'src/config/configuration';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: configuration().host,
      port: configuration().dbPort,
      user: configuration().user,
      password: configuration().password,
      database: configuration().database,
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }
  async onModuleInit() {
    await this.initializeDatabase();
  }

  async query(text: string, params?: any[]) {
    const client = await this.pool.connect();
    try {
      const res = await client.query(text, params);
      return res;
    } finally {
      client.release();
    }
  }

  async initializeDatabase() {
    await this.query(`
      CREATE TABLE IF NOT EXISTS tvl (
        id SERIAL PRIMARY KEY,
        value NUMERIC,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.logger.log('Database initialized');
  }
}

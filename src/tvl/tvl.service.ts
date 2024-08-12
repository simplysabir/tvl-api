import { Injectable, Logger } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { DatabaseService } from '../database/database.service';
import axios from 'axios';
import configuration from 'src/config/configuration';
import {
  GOVERNANCE_PROGRAM_IDS,
  SOL_MINT,
  TOKEN_PROGRAM_ID,
} from '../constants/index';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TvlService {
  private readonly logger = new Logger(TvlService.name);
  private connection: Connection;

  constructor(private readonly dbService: DatabaseService) {
    this.connection = new Connection(configuration().rpcUrl, 'confirmed');
  }

  async updateTvl() {
    try {
      const totalTvl = await this.calculateTvl();
      await this.dbService.query('INSERT INTO tvl (value) VALUES ($1)', [
        totalTvl,
      ]);
      this.logger.log('TVL updated successfully');
    } catch (error) {
      this.logger.error('Error updating TVL', error);
    }
  }

  private async calculateTvl(): Promise<number> {
    let totalTvl = 0;
    for (const programId of GOVERNANCE_PROGRAM_IDS) {
      const governanceAccounts = await this.getGovernanceAccounts(programId);
      for (const account of governanceAccounts) {
        totalTvl += await this.calculateAccountTvl(account);
      }
    }
    return totalTvl;
  }

  private async getGovernanceAccounts(programId: string): Promise<PublicKey[]> {
    const accounts = await this.connection.getProgramAccounts(
      new PublicKey(programId),
      {
        filters: [{ dataSize: 325 }],
      },
    );
    return accounts.map((account) => account.pubkey);
  }

  private async calculateAccountTvl(
    governancePubkey: PublicKey,
  ): Promise<number> {
    let accountTvl = 0;
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      governancePubkey,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

    for (const account of tokenAccounts.value) {
      const mintAddress = account.account.data.parsed.info.mint;
      const amount = parseFloat(
        account.account.data.parsed.info.tokenAmount.amount,
      );
      const price = await this.fetchTokenPrice(mintAddress);
      const value = amount * price;
      accountTvl += value;
    }

    const solBalance = await this.connection.getBalance(governancePubkey);
    const solPrice = await this.fetchTokenPrice(SOL_MINT);
    accountTvl += (solBalance * solPrice) / 1e9; // Convert lamports to SOL

    return accountTvl;
  }

  private async fetchTokenPrice(mintAddress: string): Promise<number> {
    try {
      const response = await axios.get(
        `https://price.jup.ag/v4/price?ids=${mintAddress}`,
      );
      const data = response.data;
      return data?.data[mintAddress]?.price || 0;
    } catch (error) {
      this.logger.error(`Error fetching price for ${mintAddress}`, error);
      return 0;
    }
  }

  async getLatestTvl() {
    const result = await this.dbService.query(
      'SELECT value, calculated_at FROM tvl ORDER BY calculated_at DESC LIMIT 1',
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM) // Runs at midnight on the every day
  async handleCron() {
    this.logger.debug('Running scheduled monthly TVL update');
    await this.updateTvl();
  }
}

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
import {
  getAllGovernances,
  getNativeTreasuryAddress,
  getRealms,
} from '@solana/spl-governance';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TvlService {
  private readonly logger = new Logger(TvlService.name);
  private connection: Connection;

  // In-memory cache for token prices
  private tokenPriceCache: {
    [key: string]: { price: number; timestamp: number };
  } = {};
  private readonly cacheTtl = 600000; // Cache TTL in milliseconds (e.g., 10 mins)

  // Map to store token details for logging later
  private tokenDetailsMap: Map<
    string,
    { balance: number; price: number; value: number }
  > = new Map();

  // Map to store treasury addresses for logging later
  private treasuryAddressesMap: Map<string, PublicKey[]> = new Map();

  constructor(private readonly dbService: DatabaseService) {
    this.connection = new Connection(configuration().rpcUrl, 'confirmed');
  }

  // Utility function to introduce a delay
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Exponential backoff retry logic
  private async withRetry<T>(
    fn: () => Promise<T>,
    retries = 5,
    delay = 500,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0 && error.response?.status === 429) {
        this.logger.warn(`Retrying after ${delay}ms due to rate limit...`);
        await this.sleep(delay);
        return this.withRetry(fn, retries - 1, delay * 2); // Increase delay for each retry
      } else {
        throw error;
      }
    }
  }

  // Update the total TVL for all DAOs
  async updateAllTvl(): Promise<number> {
    try {
      const results = [];
      for (const daoGovernanceProgramId of GOVERNANCE_PROGRAM_IDS) {
        const tvl = await this.calculateTvlForDao(daoGovernanceProgramId);
        results.push(tvl);
        await this.sleep(2000); // 2-second delay between DAO calculations
      }

      // Log all unique token details
      this.logTokenDetails();

      // Log all treasury addresses
      this.logTreasuryAddresses();

      // Calculate the total TVL sum
      const totalValue = results.reduce((sum, tvl) => sum + tvl, 0).toFixed(2);

      // Store the total TVL in the database
      await this.dbService.query(
        `INSERT INTO tvl (value, calculated_at) VALUES ($1, NOW())`,
        [totalValue],
      );

      this.logger.log('Total TVL for all DAOs updated successfully');
      return parseFloat(totalValue);
    } catch (error) {
      this.logger.error('Error updating total TVL for all DAOs', error);
      throw error;
    }
  }

  // Get the latest total TVL for all DAOs
  async getLatestAllTvl() {
    const result = await this.dbService.query(
      `SELECT value, calculated_at FROM tvl ORDER BY calculated_at DESC LIMIT 1`,
    );
    return result.rows.length > 0 ? parseFloat(result.rows[0].value) : null;
  }

  // Calculate TVL for a specific DAO by governance ID
  async calculateTvlForDao(daoGovernanceProgramId: string): Promise<number> {
    // First, check if we have a recent entry in the database for this DAO
    const result = await this.dbService.query(
      `SELECT value, calculated_at FROM dao_tvl WHERE dao_id = $1 ORDER BY calculated_at DESC LIMIT 1`,
      [daoGovernanceProgramId],
    );

    if (result.rows.length > 0) {
      // If the latest entry is found, return it
      const latestEntry = result.rows[0];
      this.logger.log(`Returning cached TVL for DAO ${daoGovernanceProgramId}`);
      return parseFloat(latestEntry.value);
    }

    // If no entry is found, calculate the TVL and store it
    this.logger.log(`Calculating TVL for DAO ${daoGovernanceProgramId}`);
    let totalValue = 0;

    const realms = await this.getRealms(new PublicKey(daoGovernanceProgramId));
    console.log('realms', realms.length);

    // Process realms in batches
    const batchSize = 25;
    for (let i = 0; i < realms.length; i += batchSize) {
      const realmBatch = realms.slice(i, i + batchSize);

      const batchResults = [];
      const treasuryAddressesBatch: PublicKey[] = [];

      for (const realm of realmBatch) {
        const realmValue = await this.withRetry(() =>
          this.calculateRealmTvl(realm),
        );
        console.log('realmValue', realmValue);
        batchResults.push(realmValue);
        treasuryAddressesBatch.push(
          ...(await this.getTreasuryAddresses(realm)),
        );
        await this.sleep(2000); // 2-second delay between realm calculations
      }

      // Sum up the results from the batch
      totalValue += batchResults.reduce((sum, value) => sum + value, 0);

      // Store the treasury addresses for this DAO
      this.treasuryAddressesMap.set(
        daoGovernanceProgramId,
        treasuryAddressesBatch,
      );

      // Log all unique token details
      this.logTokenDetails();

      // Log all treasury addresses
      this.logTreasuryAddresses();
    }

    // Store the DAO-specific TVL in the database
    await this.dbService.query(
      `INSERT INTO dao_tvl (dao_id, value, calculated_at) VALUES ($1, $2, NOW())`,
      [daoGovernanceProgramId, totalValue],
    );

    return totalValue;
  }

  private async calculateRealmTvl(realm: any): Promise<number> {
    const treasuryAddresses = await this.getTreasuryAddresses(realm);

    let totalValue = 0;

    for (const address of treasuryAddresses) {
      await this.sleep(500); // Delay before each balance request
      const solBalanceLamports = await this.withRetry(() =>
        this.connection.getBalance(new PublicKey(address)),
      );
      await this.sleep(500); // Delay before each price fetch
      const solPrice = await this.withRetry(() =>
        this.fetchTokenPrice(SOL_MINT),
      );
      const solBalance = solBalanceLamports / 1_000_000_000; // Convert lamports to SOL
      const solValue = solBalance * solPrice;

      this.addTokenDetail(SOL_MINT, solBalance, solPrice, solValue);

      totalValue += solValue;

      await this.sleep(500); // Delay before fetching token accounts
      const tokenAccounts = await this.withRetry(() =>
        this.connection.getParsedTokenAccountsByOwner(new PublicKey(address), {
          programId: TOKEN_PROGRAM_ID,
        }),
      );

      for (const { account } of tokenAccounts.value) {
        const mintAddress = account.data.parsed.info.mint;
        const balance = account.data.parsed.info.tokenAmount.uiAmount;
        await this.sleep(500); // Delay before fetching each token price
        const price = await this.withRetry(() =>
          this.fetchTokenPrice(mintAddress),
        );
        const tokenValue = balance * price;

        this.addTokenDetail(mintAddress, balance, price, tokenValue);

        totalValue += tokenValue;
      }
    }

    return totalValue;
  }

  private addTokenDetail(
    mintAddress: string,
    balance: number,
    price: number,
    value: number,
  ) {
    if (!this.tokenDetailsMap.has(mintAddress)) {
      this.tokenDetailsMap.set(mintAddress, { balance, price, value });
    } else {
      const existingDetails = this.tokenDetailsMap.get(mintAddress);
      this.tokenDetailsMap.set(mintAddress, {
        balance: (existingDetails?.balance || 0) + balance,
        price: existingDetails?.price || price, // Price remains the same
        value: (existingDetails?.value || 0) + value,
      });
    }
  }

  private logTokenDetails() {
    this.logger.log('Logging token details for all processed tokens:');
    this.tokenDetailsMap.forEach((details, mintAddress) => {
      this.logger.log(
        `Token: ${mintAddress}, Total Balance: ${details.balance.toFixed(6)}, Price: ${details.price.toFixed(2)}, Total Value: ${details.value.toFixed(2)}`,
      );
    });
  }

  private logTreasuryAddresses() {
    this.logger.log('Logging treasury addresses for all processed DAOs:');
    this.treasuryAddressesMap.forEach((addresses, daoGovernanceProgramId) => {
      this.logger.log(
        `DAO Governance Program ID: ${daoGovernanceProgramId}, Treasury Addresses: ${addresses.join(', ')}`,
      );
    });
  }

  private async getRealms(programId: PublicKey) {
    await this.sleep(500); // Delay before fetching realms
    return await getRealms(this.connection, programId);
  }

  private async getTreasuryAddresses(realm: any) {
    await this.sleep(500); // Delay before fetching governances
    const governances = await getAllGovernances(
      this.connection,
      new PublicKey(realm.owner.toBase58()),
      new PublicKey(realm.pubkey.toBase58()),
    );

    const treasuryAddresses = await Promise.all(
      governances.map(async (governance) => {
        await this.sleep(500); // Delay before fetching each treasury address
        return getNativeTreasuryAddress(
          new PublicKey(realm.owner.toBase58()),
          governance.pubkey,
        );
      }),
    );

    return treasuryAddresses;
  }

  private async fetchTokenPrice(mintAddress: string): Promise<number> {
    const now = Date.now();
    if (
      this.tokenPriceCache[mintAddress] &&
      now - this.tokenPriceCache[mintAddress].timestamp < this.cacheTtl
    ) {
      // Return the cached price if it's still within the TTL
      this.logger.debug(`Using cached price for ${mintAddress}`);
      return this.tokenPriceCache[mintAddress].price;
    }

    try {
      await this.sleep(500); // Delay before each price fetch request
      const response = await this.withRetry(() =>
        axios.get(`https://price.jup.ag/v4/price?ids=${mintAddress}`),
      );
      const data = response.data;
      const price = data?.data[mintAddress]?.price || 0;

      // Cache the fetched price
      this.tokenPriceCache[mintAddress] = { price, timestamp: now };

      return price;
    } catch (error) {
      this.logger.error(`Error fetching price for ${mintAddress}`, error);
      return 0;
    }
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT) // Runs at midnight on the first day of every month
  async updatingAllTvl() {
    try {
      this.logger.debug('Running scheduled monthly TVL update');
      await this.updateAllTvl();
    } catch (error) {
      this.logger.error('Error updating total TVL for all DAOs', error);
    }
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT) // Runs at midnight on the first day of every month
  async updatingEachDaoTvl() {
    try {
      for (const daoGovernanceProgramId of GOVERNANCE_PROGRAM_IDS) {
        await this.calculateTvlForDao(daoGovernanceProgramId);
        await this.sleep(2000); // 2-second delay between DAO updates
      }
    } catch (error) {
      this.logger.error('Error updating TVL for all DAOs', error);
    }
  }
}

import { Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';

export default () => {
  dotenv.config();

  return {
    port: parseInt(process.env.PORT, 10) || 3000,
    database: {
      connectionString: process.env.DB_CONNECTION_STRING,
    },
  };
};

import { Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';

export default () => {
  dotenv.config();

  return {
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '',
    dbPort: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.USER || '',
    password: process.env.PASSWORD || '',
    database: process.env.DATABASE || '',
    rpcUrl: process.env.RPC_URL,
  };
};

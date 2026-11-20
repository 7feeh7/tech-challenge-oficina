import { config } from 'dotenv';
import { resolve } from 'node:path';
import { garantirCredenciaisRs256Descartaveis } from './helpers/credenciais-rs256-descartaveis';

config({ path: resolve(__dirname, '../.env') });
garantirCredenciaisRs256Descartaveis();

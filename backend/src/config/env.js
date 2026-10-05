import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
// Local development only; on Vercel the variables come from the project settings.
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, 'backend/.env') });

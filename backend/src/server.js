// Local development server. On Vercel, /api/index.js is used instead.
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import app from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(__dirname, '../../frontend');

const local = express();
local.use(express.static(frontend));                                                   // 1) static files
local.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(frontend, 'index.html')));   // 2) SPA fallback (never for /api)
local.use(app);                                                                        // 3) the API (and its JSON 404)

const port = Number(process.env.PORT || 4000);
local.listen(port, () => console.log(`خد وهات running on http://localhost:${port}`));

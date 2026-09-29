import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDatabase } from './db';
import { inventoryRouter } from './routes/inventory';
import { inventoryImportRouter } from './routes/inventoryImport';
import { shipmentsRouter } from './routes/shipments';
import { bomRouter } from './routes/bom';
import { xeroRouter, getValidAccessToken } from './routes/xero';
import { createXeroPushRouter } from './routes/xeroPush';
import { ecommerceRouter } from './routes/ecommerce';
import { shopifyRouter } from './routes/shopify';
import { shipstationRouter } from './routes/shipstation';
import { productsRouter } from './routes/products';
import { quotesRouter } from './routes/quotes';

const app = express();
const PORT = Number(process.env.PORT) || 5000;
// Loopback only: the API is not exposed to the LAN while this runs locally.
// Set HOST explicitly when deploying behind a reverse proxy.
const HOST = process.env.HOST || '127.0.0.1';

// Only the local UI may call this API. Without authentication in front of the
// mutating routes, a permissive CORS policy would let any visited site drive them.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin and non-browser callers (curl, Xero webhooks) send no Origin header
    callback(null, !origin || ALLOWED_ORIGINS.includes(origin));
  }
}));

// Reject disallowed cross-origin requests outright rather than relying on the
// browser to discard a response the server already produced.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});

// Capture raw body for HMAC-SHA256 signature verification (Xero & Shopify webhooks)
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Initialize SQLite schema and seed data
initDatabase();

// API routes
app.use('/api/inventory', inventoryImportRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/bom', bomRouter);
app.use('/api/xero', xeroRouter);
app.use('/api/xero', createXeroPushRouter(getValidAccessToken));
app.use('/api/ecommerce', ecommerceRouter);
app.use('/api/shopify', shopifyRouter);
app.use('/api/shipstation', shipstationRouter);
app.use('/api/products', productsRouter);
app.use('/api/quotes', quotesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'SmartPrint IQ Inventory Engine',
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[SmartPrint IQ Server] Backend running on http://${HOST}:${PORT}`);
  console.log(`[SmartPrint IQ Server] CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

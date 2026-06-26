import { startServer } from './server';
import path from 'path';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5000);

// In development, serve static files from frontend if compiled, or allow proxying.
const frontendDir = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, '../../frontend/dist') 
  : undefined;

startServer({
  host: HOST,
  port: PORT,
  frontendDirectory: frontendDir
}).then((server) => {
  console.log(`White-Label CRM Local Server running on ${server.url}`);
  console.log('Press Ctrl+C to stop.');
}).catch((err) => {
  console.error('Failed to start CRM Server:', err);
  process.exit(1);
});

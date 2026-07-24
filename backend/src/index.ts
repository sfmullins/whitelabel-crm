import { startServer } from './server';
import path from 'path';
import { getRuntimePaths } from './config/runtimePaths';
import { OnboardingRepository } from './infrastructure/database/OnboardingRepository';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5000);

// In production the backend serves the compiled SPA. Development uses Vite's
// same-origin proxy so browser Origin and Host remain aligned.
const frontendDir = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../../frontend/dist')
  : undefined;

startServer({
  host: HOST,
  port: PORT,
  frontendDirectory: frontendDir
}).then((server) => {
  const lifecycle=new OnboardingRepository().getStatus();const paths=getRuntimePaths();
  console.log(`White-Label CRM Local Server running on ${server.url}`);
  console.log(JSON.stringify({
    event:'crm.startup',
    backendOrigin:server.url,
    expectedDevelopmentFrontendOrigin:`http://127.0.0.1:${process.env.CRM_FRONTEND_PORT??process.env.VITE_PORT??'3000'}`,
    configuredAllowedOrigins:(process.env.CRM_ALLOWED_ORIGINS||'').split(',').map((value)=>value.trim()).filter(Boolean),
    databasePath:paths.databasePath,
    instanceStatus:lifecycle.status,
    hasPublishedRevision:lifecycle.hasPublishedRevision,
    requiresOnboarding:lifecycle.requiresOnboarding,
  }));
  console.log('Press Ctrl+C to stop.');
}).catch((err) => {
  console.error('Failed to start CRM Server:', err);
  process.exit(1);
});

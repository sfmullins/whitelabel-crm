import http from 'http';
import express from 'express';
import path from 'path';
import app from './presentation/app';
import { ReminderScheduler } from './application/services/ReminderScheduler';

export interface StartServerOptions {
  host?: string;
  port?: number;
  frontendDirectory?: string;
}

export interface RunningServer {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startServer(
  options?: StartServerOptions
): Promise<RunningServer> {
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? 0; // Default to 0 for auto-allocation of available port
  const reminderScheduler = new ReminderScheduler();
  reminderScheduler.start();

  // If frontend directory is provided, serve static files and React Router fallback
  if (options?.frontendDirectory) {
    const staticPath = path.resolve(options.frontendDirectory);
    app.use(express.static(staticPath));
    
    // React Router fallback (wildcard)
    app.get('*', (req, res, next) => {
      // Exclude API routes and health checks from fallback
      if (req.path.startsWith('/api') || req.path === '/health') {
        return next();
      }
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);

    server.on('error', (err) => {
      reminderScheduler.stop();
      reject(err);
    });

    server.listen(port, host, () => {
      const address = server.address();
      let actualPort = port;
      
      if (address && typeof address === 'object') {
        actualPort = address.port;
      }

      const url = `http://${host}:${actualPort}`;

      const runningServer: RunningServer = {
        host,
        port: actualPort,
        url,
        close: () => {
          reminderScheduler.stop();
          return new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) {
                rejectClose(err);
              } else {
                resolveClose();
              }
            });
          });
        }
      };

      resolve(runningServer);
    });
  });
}

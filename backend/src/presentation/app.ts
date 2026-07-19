import express from 'express';
import cors from 'cors';
import settingsRouter from './routes/settings';
import customersRouter from './routes/customers';
import servicesRouter from './routes/services';
import bookingsRouter from './routes/bookings';
import invoicesRouter from './routes/invoices';
import dashboardRouter from './routes/dashboard';
import searchRouter from './routes/search';
import customFieldsRouter from './routes/customFields';
import customObjectsRouter from './routes/customObjects';
import backupsRouter from './routes/backups';
import organisationsRouter from './routes/organisations';
import contactsRouter from './routes/contacts';
import engagementsRouter from './routes/engagements';
import { AppError } from '../application/errors';

const app = express();

// Enable CORS for frontend dev server
app.use(cors());

// Support base64 image data in logo uploads (up to 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Log requests locally
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/settings', settingsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/search', searchRouter);
app.use('/api/custom-fields', customFieldsRouter);
app.use('/api/custom-objects', customObjectsRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/organisations', organisationsRouter);
app.use('/api', contactsRouter);
app.use('/api', engagementsRouter);

if (process.env.NODE_ENV === 'test') {
  app.get('/api/__test/unknown-error', () => {
    throw new Error('internal test database path /tmp/secret.sqlite constraint stack sqlite');
  });
}

// Root health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Global Error Handler
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details === undefined ? {} : { details: err.details }),
    });
  }

  console.error('Unhandled Server Error:', err);
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
});

export default app;

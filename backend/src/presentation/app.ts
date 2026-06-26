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

// Root health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
});

export default app;

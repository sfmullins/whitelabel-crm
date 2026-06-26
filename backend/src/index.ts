import app from './presentation/app';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`White-Label CRM Local Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});

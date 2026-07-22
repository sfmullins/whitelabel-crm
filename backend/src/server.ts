import http from 'http';
import express from 'express';
import path from 'path';
import app from './presentation/app';
import { ReminderScheduler } from './application/services/ReminderScheduler';
import { ScheduledReportService } from './application/services/ScheduledReportService';
import { WebhookDeliveryService } from './application/services/WebhookDeliveryService';

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

export async function startServer(options?:StartServerOptions):Promise<RunningServer>{
  const host=options?.host??'127.0.0.1';const port=options?.port??0;
  const reminderScheduler=new ReminderScheduler();const scheduledReports=new ScheduledReportService();const webhookDeliveries=new WebhookDeliveryService();
  reminderScheduler.start();scheduledReports.start();webhookDeliveries.start();

  if(options?.frontendDirectory){
    const staticPath=path.resolve(options.frontendDirectory);app.use(express.static(staticPath));
    app.get('*',(req,res,next)=>{if(req.path.startsWith('/api')||req.path==='/health'||req.path==='/ready')return next();res.sendFile(path.join(staticPath,'index.html'));});
  }

  return new Promise((resolve,reject)=>{
    const server=http.createServer(app);
    const stopServices=()=>{reminderScheduler.stop();scheduledReports.stop();webhookDeliveries.stop();};
    server.on('error',(err)=>{stopServices();reject(err);});
    server.listen(port,host,()=>{
      const address=server.address();let actualPort=port;if(address&&typeof address==='object')actualPort=address.port;const url=`http://${host}:${actualPort}`;
      resolve({host,port:actualPort,url,close:()=>{stopServices();return new Promise<void>((resolveClose,rejectClose)=>{server.close((err)=>err?rejectClose(err):resolveClose());});}});
    });
  });
}

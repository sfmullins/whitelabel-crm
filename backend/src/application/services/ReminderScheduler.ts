import { WorkRepository } from '../../infrastructure/database/WorkRepository';
import { NotificationRepository } from '../../infrastructure/database/NotificationRepository';

export interface ReminderDelivery {
  id:string;
  sourceType:string;
  sourceId:string;
  organisationId:string|null;
  scheduledAt:string;
  deliveryMethod:string;
}

export type ReminderDeliverer=(reminder:ReminderDelivery)=>Promise<void>|void;

export class ReminderScheduler {
  private timer:NodeJS.Timeout|null=null;
  private running=false;
  private readonly notifications:NotificationRepository;

  constructor(
    private readonly repository=new WorkRepository(),
    private readonly deliverer?:ReminderDeliverer,
    private readonly intervalMs=60_000,
    notifications?:NotificationRepository,
  ){this.notifications=notifications??new NotificationRepository();}

  start():void {
    if(this.timer)return;
    void this.processDue();
    this.timer=setInterval(()=>void this.processDue(),this.intervalMs);
    this.timer.unref?.();
  }

  stop():void { if(this.timer)clearInterval(this.timer);this.timer=null; }

  async processDue():Promise<{delivered:number;failed:number}> {
    if(this.running)return {delivered:0,failed:0};
    this.running=true;let delivered=0;let failed=0;
    try{
      const reminders=this.repository.listReminders({status:'pending',dueOnly:true}) as ReminderDelivery[];
      for(const reminder of reminders){
        try{
          if(this.deliverer)await this.deliverer(reminder);
          else this.notifications.enqueueReminder(reminder);
          this.repository.updateReminderStatus(reminder.id,'delivered');
          delivered+=1;
        }catch(error){this.repository.updateReminderStatus(reminder.id,'failed',error instanceof Error?error.message:String(error));failed+=1;}
      }
      return {delivered,failed};
    }finally{this.running=false;}
  }
}

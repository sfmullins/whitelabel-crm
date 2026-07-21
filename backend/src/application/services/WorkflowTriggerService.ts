import { WorkflowRepository } from '../../infrastructure/database/WorkflowRepository';

function conditionsMatch(conditions:Record<string,unknown>,context:Record<string,unknown>):boolean {
  return Object.entries(conditions).every(([key,expected])=>{
    const actual=context[key];
    if(Array.isArray(expected))return expected.includes(actual);
    if(expected && typeof expected==='object' && !Array.isArray(expected)){
      const operator=expected as Record<string,unknown>;
      if(typeof operator.contains==='string')return String(actual??'').toLowerCase().includes(operator.contains.toLowerCase());
      if(typeof operator.equals!=='undefined')return actual===operator.equals;
      if(typeof operator.gte==='number')return Number(actual)>=operator.gte;
      if(typeof operator.lte==='number')return Number(actual)<=operator.lte;
    }
    return actual===expected;
  });
}

export class WorkflowTriggerService {
  constructor(private readonly repository=new WorkflowRepository()){}

  trigger(input:{triggerType:string;sourceType:string;sourceId:string;eventId:string;context:Record<string,unknown>}){
    const results=[];
    for(const workflow of this.repository.listDefinitions()){
      if(!workflow.enabled || workflow.triggerType!==input.triggerType)continue;
      if(!conditionsMatch(workflow.conditions as Record<string,unknown>,input.context))continue;
      results.push(this.repository.run({
        workflowId:String(workflow.id),
        sourceType:input.sourceType,
        sourceId:input.sourceId,
        triggerEvent:input.triggerType,
        idempotencyKey:`trigger:${String(workflow.id)}:${input.eventId}`,
        context:input.context,
      }));
    }
    return results;
  }
}

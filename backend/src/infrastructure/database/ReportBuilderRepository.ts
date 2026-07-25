import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';
import type { RequestIdentity } from './SecurityRepository';

export type ReportFilterOperator='equals'|'contains'|'not_empty'|'before'|'after';
export interface ReportBuilderFilter {field:string;operator:ReportFilterOperator;value?:string;}
export interface ReportBuilderDefinition {
  sourceKey:string;
  columns:string[];
  filters:ReportBuilderFilter[];
  groupBy?:string|null;
}
interface ReportColumn {key:string;label:string;type:string;}
interface ReportSource {key:string;name:string;description:string;columns:ReportColumn[];}

const now=()=>new Date().toISOString();
function parse<T>(value:unknown,fallback:T):T{try{return JSON.parse(String(value)) as T;}catch{return fallback;}}
function visible(row:{owner_user_id:string;owner_team_id:string|null;visibility:string},identity:RequestIdentity):boolean{
  return row.owner_user_id===identity.id||row.visibility==='all'||(row.visibility==='team'&&Boolean(row.owner_team_id&&identity.teams.some((team)=>team.id===row.owner_team_id)))||identity.roles.some((role)=>role.key==='owner'||role.key==='administrator');
}
function admin(identity:RequestIdentity):boolean{return identity.roles.some((role)=>role.key==='owner'||role.key==='administrator');}
function compare(value:unknown,filter:ReportBuilderFilter):boolean{
  const current=String(value??'');const expected=String(filter.value??'');
  if(filter.operator==='equals')return current.toLocaleLowerCase()===expected.toLocaleLowerCase();
  if(filter.operator==='contains')return current.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if(filter.operator==='not_empty')return current.trim().length>0;
  if(filter.operator==='before')return current!==''&&current<expected;
  return current!==''&&current>expected;
}
function csvCell(value:unknown):string{const text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}

export class ReportBuilderRepository{
  constructor(private readonly connection:Database.Database=sqlite as Database.Database){}

  catalog():{sources:ReportSource[]}{
    const customerColumns:ReportColumn[]=[
      {key:'id',label:'Customer ID',type:'text'},{key:'first_name',label:'First name',type:'text'},
      {key:'last_name',label:'Last name',type:'text'},{key:'company',label:'Company',type:'text'},
      {key:'email',label:'Email',type:'email'},{key:'phone',label:'Phone',type:'phone'},
      {key:'mobile',label:'Mobile',type:'phone'},{key:'address',label:'Address',type:'text'},
      {key:'notes',label:'Notes',type:'textarea'},{key:'created_at',label:'Created',type:'datetime'},
      {key:'updated_at',label:'Updated',type:'datetime'},
      ...this.fields('customer'),
    ];
    const definitions=this.connection.prepare(`SELECT id,api_name,name,plural_name,description FROM custom_objects_definition ORDER BY plural_name`).all() as Array<any>;
    const sources:ReportSource[]=[{key:'customers',name:'Customers',description:'Core customer records and configured customer fields.',columns:customerColumns}];
    for(const definition of definitions)sources.push({
      key:String(definition.api_name),name:String(definition.plural_name),
      description:String(definition.description??`${definition.plural_name} connected to customers.`),
      columns:[
        {key:'record_id',label:'Record ID',type:'text'},{key:'customer_id',label:'Customer ID',type:'text'},
        {key:'customer_name',label:'Customer',type:'text'},{key:'customer_email',label:'Customer email',type:'email'},
        {key:'created_at',label:'Created',type:'datetime'},{key:'updated_at',label:'Updated',type:'datetime'},
        ...this.fields(String(definition.api_name)),
      ],
    });
    return {sources};
  }

  run(input:ReportBuilderDefinition,limit=500){
    const source=this.requireSource(input.sourceKey);const allowed=new Set(source.columns.map((column)=>column.key));
    const columns=[...new Set(input.columns)].filter((column)=>allowed.has(column)).slice(0,30);
    if(!columns.length)throw new Error('Choose at least one report column');
    const filters=(input.filters??[]).slice(0,10);
    for(const filter of filters)if(!allowed.has(filter.field))throw new Error(`Unsupported report filter: ${filter.field}`);
    if(input.groupBy&&!allowed.has(input.groupBy))throw new Error('Unsupported report grouping');
    const raw=input.sourceKey==='customers'?this.customerRows():this.objectRows(input.sourceKey);
    const matched=raw.filter((row)=>filters.every((filter)=>compare(row[filter.field],filter)));
    const bounded=matched.slice(0,Math.max(1,Math.min(1000,limit)));
    const rows=bounded.map((row)=>Object.fromEntries(columns.map((column)=>[column,row[column]??''])));
    const groups=input.groupBy?[...matched.reduce((map,row)=>{const name=String(row[input.groupBy!]??'').trim()||'Not set';map.set(name,(map.get(name)??0)+1);return map;},new Map<string,number>())].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)):[];
    return {source:{key:source.key,name:source.name},columns:columns.map((key)=>source.columns.find((column)=>column.key===key)!),rows,groups,total:matched.length,truncated:matched.length>bounded.length,generatedAt:now()};
  }

  exportCsv(input:ReportBuilderDefinition){const result=this.run(input,1000);const headers=result.columns.map((column)=>column.key);const labels=result.columns.map((column)=>csvCell(column.label));return {filename:`${input.sourceKey}-report-${now().slice(0,10)}.csv`,content:[labels.join(','),...result.rows.map((row)=>headers.map((header)=>csvCell(row[header])).join(','))].join('\r\n')};}

  list(identity:RequestIdentity){return (this.connection.prepare(`SELECT * FROM report_builder_definitions WHERE archived_at IS NULL ORDER BY updated_at DESC,name`).all() as Array<any>).filter((row)=>visible(row,identity)).map((row)=>this.map(row));}
  create(identity:RequestIdentity,input:{name:string;description?:string|null;definition:ReportBuilderDefinition;visibility?:'private'|'team'|'all';teamId?:string|null}){
    this.run(input.definition,1);const id=crypto.randomUUID();const timestamp=now();const visibility=input.visibility??'private';const teamId=visibility==='team'?(input.teamId||identity.teams[0]?.id||null):null;if(visibility==='team'&&!teamId)throw new Error('Team visibility requires a team');
    this.connection.prepare(`INSERT INTO report_builder_definitions(id,name,description,source_key,columns_json,filters_json,group_by,visibility,owner_user_id,owner_team_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.name.trim(),input.description?.trim()||null,input.definition.sourceKey,JSON.stringify(input.definition.columns),JSON.stringify(input.definition.filters??[]),input.definition.groupBy??null,visibility,identity.id,teamId,timestamp,timestamp);
    return this.map(this.connection.prepare(`SELECT * FROM report_builder_definitions WHERE id=?`).get(id));
  }
  archive(identity:RequestIdentity,id:string){const row=this.connection.prepare(`SELECT * FROM report_builder_definitions WHERE id=?`).get(id) as any;if(!row||row.owner_user_id!==identity.id&&!admin(identity))throw new Error('Saved report not found');this.connection.prepare(`UPDATE report_builder_definitions SET archived_at=?,updated_at=? WHERE id=?`).run(now(),now(),id);return {id,archived:true};}
  get(identity:RequestIdentity,id:string){const row=this.connection.prepare(`SELECT * FROM report_builder_definitions WHERE id=? AND archived_at IS NULL`).get(id) as any;if(!row||!visible(row,identity))throw new Error('Saved report not found');return this.map(row);}

  private fields(entityType:string):ReportColumn[]{return (this.connection.prepare(`SELECT name,label,type FROM custom_fields_definition WHERE entity_type=? ORDER BY created_at,name`).all(entityType) as Array<any>).map((row)=>({key:String(row.name),label:String(row.label),type:String(row.type)}));}
  private requireSource(key:string):ReportSource{const source=this.catalog().sources.find((item)=>item.key===key);if(!source)throw new Error('Report source is unavailable');return source;}
  private customerRows():Array<Record<string,unknown>>{
    const rows=this.connection.prepare(`SELECT id,first_name,last_name,company,email,phone,mobile,address,notes,created_at,updated_at FROM customers ORDER BY updated_at DESC`).all() as Array<Record<string,unknown>>;
    const values=this.connection.prepare(`SELECT v.entity_id,d.name,v.value FROM custom_fields_values v JOIN custom_fields_definition d ON d.id=v.field_id WHERE d.entity_type='customer'`).all() as Array<any>;
    const byId=new Map<string,Record<string,unknown>>();for(const row of rows)byId.set(String(row.id),{...row});for(const value of values){const row=byId.get(String(value.entity_id));if(row)row[String(value.name)]=value.value;}return [...byId.values()];
  }
  private objectRows(apiName:string):Array<Record<string,unknown>>{
    const rows=this.connection.prepare(`SELECT r.id AS record_id,r.customer_id,r.created_at,r.updated_at,c.first_name||' '||c.last_name AS customer_name,c.email AS customer_email FROM custom_objects_records r JOIN custom_objects_definition d ON d.id=r.object_definition_id JOIN customers c ON c.id=r.customer_id WHERE d.api_name=? ORDER BY r.updated_at DESC`).all(apiName) as Array<Record<string,unknown>>;
    const values=this.connection.prepare(`SELECT v.record_id,d.name,v.value FROM custom_objects_values v JOIN custom_fields_definition d ON d.id=v.field_id WHERE d.entity_type=?`).all(apiName) as Array<any>;
    const byId=new Map<string,Record<string,unknown>>();for(const row of rows)byId.set(String(row.record_id),{...row});for(const value of values){const row=byId.get(String(value.record_id));if(row)row[String(value.name)]=value.value;}return [...byId.values()];
  }
  private map(row:any){return {id:row.id,name:row.name,description:row.description,definition:{sourceKey:row.source_key,columns:parse<string[]>(row.columns_json,[]),filters:parse<ReportBuilderFilter[]>(row.filters_json,[]),groupBy:row.group_by},visibility:row.visibility,ownerUserId:row.owner_user_id,ownerTeamId:row.owner_team_id,createdAt:row.created_at,updatedAt:row.updated_at};}
}

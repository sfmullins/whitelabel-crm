import type { WorkspaceModel,WorkspaceModelDefinition } from 'shared';

export interface WorkspaceExperience {
  specialist:boolean;
  groupLabel:string;
  workspaceLabel:string;
  dashboardTitle:string;
  dashboardDescription:string;
  searchPlaceholder:string;
  createLabel:string;
}

const sectorExperience:Record<WorkspaceModel['sector'],Omit<WorkspaceExperience,'specialist'>>={
  general:{
    groupLabel:'CRM',workspaceLabel:'CRM workspace',dashboardTitle:'Dashboard',
    dashboardDescription:'Operational signals from persisted CRM and financial records.',
    searchPlaceholder:'Search organisations, contacts, activities, tasks, documents and communications…',
    createLabel:'Create',
  },
  'after-school-childcare':{
    groupLabel:'Childcare',workspaceLabel:'After-school childcare workspace',dashboardTitle:'Childcare overview',
    dashboardDescription:'Families, children, enrolments, attendance and follow-up in one place.',
    searchPlaceholder:'Search families, guardians, children, tasks and communications…',
    createLabel:'Add guardian',
  },
  'pet-behaviour':{
    groupLabel:'Pet care',workspaceLabel:'Pet behaviour workspace',dashboardTitle:'Practice overview',
    dashboardDescription:'Owners, pets, behaviour cases and consultation plans in one place.',
    searchPlaceholder:'Search pet owners, pets, cases, tasks and communications…',
    createLabel:'Add pet owner',
  },
  veterinary:{
    groupLabel:'Practice',workspaceLabel:'Veterinary practice workspace',dashboardTitle:'Practice overview',
    dashboardDescription:'Owners, animals, consultations, vaccinations and prescriptions in one place.',
    searchPlaceholder:'Search animal owners, pets, consultations, tasks and communications…',
    createLabel:'Add animal owner',
  },
  'pet-grooming':{
    groupLabel:'Grooming',workspaceLabel:'Pet grooming workspace',dashboardTitle:'Grooming overview',
    dashboardDescription:'Owners, pets, grooming profiles and appointments in one place.',
    searchPlaceholder:'Search pet owners, pets, appointments, tasks and communications…',
    createLabel:'Add pet owner',
  },
};

export function workspaceExperience(model:WorkspaceModel|undefined):WorkspaceExperience{
  const sector=model?.sector??'general';
  const templateDriven=model?.mode==='template'&&Boolean(model.templateKey)&&model.templateKey!=='simple-crm';
  return {...sectorExperience[sector],...(model?.presentation??{}),specialist:templateDriven};
}

export function definitionRoute(definition:WorkspaceModelDefinition):string{
  return `/records/${encodeURIComponent(definition.apiName)}`;
}

export function recordTitle(definition:WorkspaceModelDefinition,values:Record<string,unknown>):string{
  const preferred=['first_name','pet_name','child_name','name','last_name','presenting_concern','summary'];
  const parts=preferred.map((key)=>String(values[key]??'').trim()).filter(Boolean);
  if(parts.length)return parts.slice(0,2).join(' ');
  const first=definition.fields.map((field)=>String(values[field.name]??'').trim()).find(Boolean);
  return first||definition.name;
}

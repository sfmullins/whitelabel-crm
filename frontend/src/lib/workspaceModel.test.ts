import { describe,expect,it } from 'vitest';
import type { WorkspaceModel } from 'shared';
import { recordTitle,workspaceExperience } from './workspaceModel';

const childcare:WorkspaceModel={
  sector:'after-school-childcare',
  mode:'template',
  templateKey:'after-school-childcare',
  templateName:'After-school childcare',
  customerCount:2,
  customerSingular:'Parent or guardian',
  customerPlural:'Families & guardians',
  definitions:[{
    id:'11111111-1111-4111-8111-111111111111',
    name:'Child',
    pluralName:'Children',
    apiName:'child',
    description:'Child record',
    createdAt:'2026-07-25T00:00:00.000Z',
    recordCount:1,
    fields:[
      {id:'22222222-2222-4222-8222-222222222222',entityType:'child',name:'first_name',label:'First name',type:'text',options:[],required:true},
      {id:'33333333-3333-4333-8333-333333333333',entityType:'child',name:'last_name',label:'Last name',type:'text',options:[],required:true},
    ],
  }],
};

describe('workspace model experience',()=>{
  it('turns an applied childcare model into an explicit specialist workspace',()=>{
    expect(workspaceExperience(childcare)).toMatchObject({
      specialist:true,
      groupLabel:'Childcare',
      workspaceLabel:'After-school childcare workspace',
      dashboardTitle:'Childcare overview',
      createLabel:'Add guardian',
    });
  });

  it('keeps blank and general models on the standard CRM experience',()=>{
    expect(workspaceExperience({...childcare,sector:'general',mode:'blank'})).toMatchObject({
      specialist:false,
      groupLabel:'CRM',
      dashboardTitle:'Dashboard',
    });
  });

  it('derives a useful record title from model values',()=>{
    expect(recordTitle(childcare.definitions[0],{first_name:'Aoife',last_name:'Murphy'})).toBe('Aoife Murphy');
  });
});

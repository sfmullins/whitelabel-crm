import type { WorkspacePresentation } from 'shared';

const generic:WorkspacePresentation={
  groupLabel:'CRM',
  workspaceLabel:'CRM workspace',
  dashboardTitle:'Dashboard',
  dashboardDescription:'Operational signals from persisted CRM and financial records.',
  searchPlaceholder:'Search organisations, contacts, activities, tasks, documents and communications…',
  createLabel:'Create',
  navigation:[
    {source:'route',key:'organisations',label:'Organisations',route:'/organisations'},
    {source:'route',key:'contacts',label:'Contacts',route:'/contacts'},
    {source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'},
  ],
  dashboardCards:[],
  quickActions:[],
  starterReports:[],
};

const customer=(label?:string)=>({source:'customers' as const,key:'customers',label});
const object=(key:string,label?:string)=>({source:'custom_object' as const,key,label});
const action=(key:string,label:string)=>({source:'custom_object' as const,key,label});
const report=(key:string,name:string,description:string,sourceKey:string,columns:string[],groupBy?:string)=>({key,name,description,sourceKey,columns,groupBy});

export const WORKSPACE_TEMPLATE_CATALOG:Record<string,WorkspacePresentation>={
  'b2b-services':{
    ...generic,groupLabel:'Sales & delivery',workspaceLabel:'Business services workspace',
    dashboardTitle:'Business services overview',dashboardDescription:'Customers, opportunities and projects in one place.',
    createLabel:'Add customer',
    navigation:[customer('Customers'),object('opportunity'),object('project'),{source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'}],
    dashboardCards:[customer('Customers'),object('opportunity'),object('project')],
    quickActions:[{source:'customers',key:'customers',label:'Add customer'},action('opportunity','Add opportunity'),action('project','Add project')],
    starterReports:[
      report('opportunities-by-stage','Opportunities by next step','Opportunity volume grouped by the recorded next step.','opportunity',['customer_name','estimated_value','expected_close_date','next_step'],'next_step'),
      report('projects-by-status','Projects by status','Current project workload grouped by status.','project',['customer_name','start_date','target_date','project_status'],'project_status'),
    ],
  },
  'b2c-services':{
    ...generic,groupLabel:'Customers & appointments',workspaceLabel:'Consumer services workspace',
    dashboardTitle:'Service overview',dashboardDescription:'Customers, appointments and follow-up in one place.',createLabel:'Add customer',
    navigation:[customer('Customers'),object('appointment'),{source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'}],
    dashboardCards:[customer('Customers'),object('appointment')],
    quickActions:[{source:'customers',key:'customers',label:'Add customer'},action('appointment','Add appointment')],
    starterReports:[report('appointments-by-status','Appointments by status','Appointment volume grouped by current status.','appointment',['customer_name','appointment_date','service_requested','appointment_status'],'appointment_status')],
  },
  ecommerce:{
    ...generic,groupLabel:'Commerce',workspaceLabel:'Online retail workspace',dashboardTitle:'Commerce overview',
    dashboardDescription:'Customers, orders and returns in one place.',createLabel:'Add customer',
    navigation:[customer('Customers'),object('order'),object('return')],
    dashboardCards:[customer('Customers'),object('order'),object('return')],
    quickActions:[{source:'customers',key:'customers',label:'Add customer'},action('order','Add order'),action('return','Add return')],
    starterReports:[
      report('orders-by-status','Orders by status','Order volume grouped by fulfilment status.','order',['customer_name','order_number','order_value','order_status'],'order_status'),
      report('returns-by-status','Returns by status','Returns grouped by their current status.','return',['customer_name','return_reason','return_status'],'return_status'),
    ],
  },
  'physical-retail':{
    ...generic,groupLabel:'Retail',workspaceLabel:'Retail workspace',dashboardTitle:'Retail overview',
    dashboardDescription:'Customers, purchases and follow-up in one place.',createLabel:'Add customer',
    navigation:[customer('Customers'),object('purchase')],
    dashboardCards:[customer('Customers'),object('purchase')],
    quickActions:[{source:'customers',key:'customers',label:'Add customer'},action('purchase','Add purchase')],
    starterReports:[report('purchases','Purchase history','Customer purchase records for the selected period.','purchase',['customer_name','receipt_number','purchase_date','purchase_value'])],
  },
  'after-school-childcare':{
    ...generic,groupLabel:'Childcare',workspaceLabel:'After-school childcare workspace',dashboardTitle:'Childcare overview',
    dashboardDescription:'Families, children, enrolments, attendance and follow-up in one place.',
    searchPlaceholder:'Search families, guardians, children, tasks and communications…',createLabel:'Add guardian',
    navigation:[customer('Families & guardians'),object('child'),object('childcare_enrolment'),object('childcare_attendance'),object('childcare_incident'),{source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'}],
    dashboardCards:[customer('Families & guardians'),object('child'),object('childcare_enrolment'),object('childcare_attendance'),object('childcare_incident')],
    quickActions:[{source:'customers',key:'customers',label:'Add parent or guardian'},action('child','Add child'),action('childcare_enrolment','Add enrolment'),action('childcare_attendance','Record attendance'),action('childcare_incident','Record incident follow-up')],
    starterReports:[
      report('active-enrolments','Enrolments by status','Children grouped by their current enrolment status.','childcare_enrolment',['customer_name','child_name','start_date','days_attending','enrolment_status'],'enrolment_status'),
      report('attendance-by-status','Attendance by status','Attendance records grouped by status.','childcare_attendance',['customer_name','child_name','attendance_date','arrival_time','collection_time','attendance_status'],'attendance_status'),
      report('incidents-by-type','Incident follow-up by type','Incident follow-ups grouped by recorded type.','childcare_incident',['customer_name','child_name','incident_date','incident_type','guardian_notified'],'incident_type'),
    ],
  },
  'pet-behaviour':{
    ...generic,groupLabel:'Pet care',workspaceLabel:'Pet behaviour workspace',dashboardTitle:'Practice overview',
    dashboardDescription:'Owners, pets, behaviour cases and consultation plans in one place.',
    searchPlaceholder:'Search pet owners, pets, cases, tasks and communications…',createLabel:'Add pet owner',
    navigation:[customer('Pet owners'),object('pet'),object('behaviour_case'),object('behaviour_consultation'),{source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'}],
    dashboardCards:[customer('Pet owners'),object('pet'),object('behaviour_case'),object('behaviour_consultation')],
    quickActions:[{source:'customers',key:'customers',label:'Add pet owner'},action('pet','Add pet'),action('behaviour_case','Add behaviour case'),action('behaviour_consultation','Add consultation')],
    starterReports:[
      report('behaviour-cases-by-status','Cases by status','Behaviour cases grouped by current status.','behaviour_case',['customer_name','pet_name','presenting_concern','case_status'],'case_status'),
      report('consultations','Consultation plans','Consultations and next review dates.','behaviour_consultation',['customer_name','pet_name','consultation_date','session_type','next_review_date'],'session_type'),
    ],
  },
  'veterinary-practice':{
    ...generic,groupLabel:'Practice',workspaceLabel:'Veterinary practice workspace',dashboardTitle:'Practice overview',
    dashboardDescription:'Owners, animals, consultations, vaccinations and prescriptions in one place.',
    searchPlaceholder:'Search animal owners, pets, consultations, tasks and communications…',createLabel:'Add animal owner',
    navigation:[customer('Animal owners'),object('pet','Animals'),object('veterinary_consultation'),object('vaccination'),object('prescription'),{source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'}],
    dashboardCards:[customer('Animal owners'),object('pet','Animals'),object('veterinary_consultation'),object('vaccination'),object('prescription')],
    quickActions:[{source:'customers',key:'customers',label:'Add animal owner'},action('pet','Add animal'),action('veterinary_consultation','Add consultation'),action('vaccination','Add vaccination'),action('prescription','Add prescription')],
    starterReports:[
      report('consultations','Consultations','Clinical consultations and follow-up dates.','veterinary_consultation',['customer_name','pet_name','consultation_date','presenting_concern','diagnosis','follow_up_date']),
      report('vaccinations-due','Vaccinations due','Vaccinations and their next due dates.','vaccination',['customer_name','pet_name','vaccine','administered_date','next_due_date']),
    ],
  },
  'pet-grooming':{
    ...generic,groupLabel:'Grooming',workspaceLabel:'Pet grooming workspace',dashboardTitle:'Grooming overview',
    dashboardDescription:'Owners, pets, grooming profiles and appointments in one place.',
    searchPlaceholder:'Search pet owners, pets, appointments, tasks and communications…',createLabel:'Add pet owner',
    navigation:[customer('Pet owners'),object('pet'),object('grooming_profile'),object('grooming_appointment'),{source:'route',key:'follow-ups',label:'Follow-ups',route:'/follow-ups'}],
    dashboardCards:[customer('Pet owners'),object('pet'),object('grooming_profile'),object('grooming_appointment')],
    quickActions:[{source:'customers',key:'customers',label:'Add pet owner'},action('pet','Add pet'),action('grooming_profile','Add grooming profile'),action('grooming_appointment','Add appointment')],
    starterReports:[report('appointments-by-status','Appointments by status','Grooming appointments grouped by current status.','grooming_appointment',['customer_name','pet_name','appointment_date','services','appointment_status','next_visit_due'],'appointment_status')],
  },
  'simple-crm':generic,
};

export function workspacePresentation(templateKey:string|null):WorkspacePresentation{
  return templateKey&&WORKSPACE_TEMPLATE_CATALOG[templateKey] ? WORKSPACE_TEMPLATE_CATALOG[templateKey] : generic;
}

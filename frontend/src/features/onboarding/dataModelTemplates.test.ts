import { describe,expect,it } from "vitest";
import { CustomFieldDefinitionSchema } from "shared";
import { rankDataModelTemplates } from "./dataModelTemplates";

const profile = {
  sector: "general" as const,
  customerType: "businesses" as const,
  operatingModel: "services" as const,
  relationshipStyle: "repeat" as const,
  tracksProducts: false,
  booksAppointments: false,
  confirmed: true,
};

describe("data model template recommendations",()=>{
  it("puts B2B services first for a service business selling to companies",()=>{
    expect(rankDataModelTemplates(profile)[0].key).toBe("b2b-services");
  });

  it("prioritises ecommerce over the customer-type default",()=>{
    expect(rankDataModelTemplates({...profile,customerType:"consumers",operatingModel:"ecommerce",tracksProducts:true})[0].key).toBe("ecommerce");
  });

  it.each([
    ["after-school-childcare", "after-school-childcare"],
    ["pet-behaviour", "pet-behaviour"],
    ["veterinary", "veterinary-practice"],
    ["pet-grooming", "pet-grooming"],
  ] as const)("puts the %s specialist model first when that sector is selected",(sector,templateKey)=>{
    expect(rankDataModelTemplates({...profile,sector,customerType:"consumers",booksAppointments:true})[0].key).toBe(templateKey);
  });

  it("provides operational records tailored to each specialist model",()=>{
    const templates=rankDataModelTemplates(profile);
    expect(templates.find((item)=>item.key==="after-school-childcare")?.objects.map((item)=>item.apiName)).toEqual([
      "child","childcare_enrolment","childcare_attendance","childcare_incident",
    ]);
    expect(templates.find((item)=>item.key==="pet-behaviour")?.objects.map((item)=>item.apiName)).toEqual([
      "pet","behaviour_case","behaviour_consultation",
    ]);
    expect(templates.find((item)=>item.key==="veterinary-practice")?.objects.map((item)=>item.apiName)).toEqual([
      "pet","veterinary_consultation","vaccination","prescription",
    ]);
    expect(templates.find((item)=>item.key==="pet-grooming")?.objects.map((item)=>item.apiName)).toEqual([
      "pet","grooming_profile","grooming_appointment",
    ]);
  });

  it("keeps every supplied field compatible with the canonical custom-field contract",()=>{
    for(const template of rankDataModelTemplates(profile)){
      for(const field of template.customerFields){
        expect(CustomFieldDefinitionSchema.safeParse({
          entityType:"customer",
          ...field,
          required:field.required??false,
          options:field.options??[],
        }).success,`${template.key}.customer.${field.name}`).toBe(true);
      }
      for(const object of template.objects){
        expect(object.apiName).toMatch(/^[a-z0-9_]+$/);
        expect(new Set(object.fields.map((field)=>field.name)).size).toBe(object.fields.length);
        for(const field of object.fields){
          expect(CustomFieldDefinitionSchema.safeParse({
            entityType:object.apiName,
            ...field,
            required:field.required??false,
            options:field.options??[],
          }).success,`${template.key}.${object.apiName}.${field.name}`).toBe(true);
        }
      }
    }
  });

  it("keeps every template available so recommendations do not lock the owner in",()=>{
    expect(rankDataModelTemplates(profile).map((item)=>item.key).sort()).toEqual([
      "after-school-childcare","b2b-services","b2c-services","ecommerce","pet-behaviour",
      "pet-grooming","physical-retail","simple-crm","veterinary-practice",
    ]);
  });
});

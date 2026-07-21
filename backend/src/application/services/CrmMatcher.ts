import { ConnectedCommunicationsRepository } from '../../infrastructure/database/ConnectedCommunicationsRepository';
import type { EmailAddress } from '../../infrastructure/integrations/ConnectedAdapters';

export interface MatchResult {
  organisationId:string|null;
  contactId:string|null;
  status:'matched'|'suggested'|'unmatched';
  reason:string;
  confidence:number;
}

function domain(address:string):string|null { const value=address.toLowerCase().split('@')[1];return value&&value.includes('.')?value:null; }

export class CrmMatcher {
  constructor(private readonly repository=new ConnectedCommunicationsRepository()){}

  matchAddresses(addresses:EmailAddress[]):MatchResult {
    const unique=[...new Set(addresses.map((value)=>value.address.toLowerCase()).filter(Boolean))];
    const exact=unique.flatMap((email)=>this.repository.findContactByEmail(email));
    const uniqueExact=[...new Map(exact.map((row)=>[row.contact_id,row])).values()];
    if(uniqueExact.length===1)return {organisationId:uniqueExact[0].organisation_id,contactId:uniqueExact[0].contact_id,status:'matched',reason:'Exact active contact email match',confidence:100};
    if(uniqueExact.length>1){const organisations=[...new Set(uniqueExact.map((row)=>row.organisation_id))];if(organisations.length===1)return {organisationId:organisations[0],contactId:null,status:'suggested',reason:'Multiple exact contacts in one organisation',confidence:90};return {organisationId:null,contactId:null,status:'unmatched',reason:'Addresses match contacts in several organisations',confidence:0};}
    const domains=[...new Set(unique.map(domain).filter((value):value is string=>Boolean(value)))].filter((value)=>!['gmail.com','outlook.com','hotmail.com','yahoo.com','icloud.com','proton.me','protonmail.com'].includes(value));
    const organisations=domains.flatMap((value)=>this.repository.findOrganisationByDomain(value));
    const uniqueOrganisations=[...new Map(organisations.map((row)=>[row.id,row])).values()];
    if(uniqueOrganisations.length===1)return {organisationId:uniqueOrganisations[0].id,contactId:null,status:'suggested',reason:'Unambiguous organisation website domain match',confidence:75};
    return {organisationId:null,contactId:null,status:'unmatched',reason:uniqueOrganisations.length>1?'Domain matches several organisations':'No exact contact or organisation-domain match',confidence:0};
  }
}

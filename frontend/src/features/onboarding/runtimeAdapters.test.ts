import { describe,expect,it } from 'vitest';
import type { OnboardingWorkspace,ReadinessResult } from 'shared/onboarding';
import { normalizeOnboardingWorkspace,normalizeReadinessResult,unwrapCollection } from './runtimeAdapters';

describe('onboarding runtime adapters',()=>{
  it('unwraps both array and keyed collection responses',()=>{
    expect(unwrapCollection<number>([1,2],'items')).toEqual([1,2]);
    expect(unwrapCollection<number>({roles:[3,4]},'roles','items')).toEqual([3,4]);
    expect(unwrapCollection<number>({items:[5]},'roles','items')).toEqual([5]);
    expect(unwrapCollection<number>({unexpected:true},'roles','items')).toEqual([]);
  });

  it('maps backend readiness sections to valid provisioning navigation keys',()=>{
    const readiness={checks:[
      {id:'brand',section:'branding'},
      {id:'comms',section:'communications'},
      {id:'review',section:'review'},
      {id:'security',section:'security'},
      {id:'people',section:'people'},
    ]} as unknown as ReadinessResult;
    expect(normalizeReadinessResult(readiness).checks.map((check)=>check.section)).toEqual(['brand','integrations','publish','recovery','people']);
  });

  it('normalizes workspace readiness without altering the draft',()=>{
    const workspace={readiness:{checks:[{id:'brand',section:'branding'}]},draft:{configuration:{schemaVersion:1}}} as unknown as OnboardingWorkspace;
    const normalized=normalizeOnboardingWorkspace(workspace);
    expect(normalized.readiness.checks[0].section).toBe('brand');
    expect(normalized.draft).toBe(workspace.draft);
  });
});

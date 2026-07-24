import type { OnboardingWorkspace,ReadinessCheck } from 'shared/onboarding';

const readinessSectionMap:Record<string,string>={
  branding:'brand',
  communications:'integrations',
  review:'publish',
  security:'recovery',
};

export function unwrapCollection<T>(value:unknown,...keys:string[]):T[]{
  if(Array.isArray(value))return value as T[];
  if(value&&typeof value==='object'){
    for(const key of keys){
      const candidate=(value as Record<string,unknown>)[key];
      if(Array.isArray(candidate))return candidate as T[];
    }
  }
  return [];
}

export function normalizeOnboardingWorkspace(workspace:OnboardingWorkspace):OnboardingWorkspace{
  return {
    ...workspace,
    readiness:{
      ...workspace.readiness,
      checks:workspace.readiness.checks.map((check):ReadinessCheck=>({
        ...check,
        section:check.section?readinessSectionMap[check.section]??check.section:check.section,
      })),
    },
  };
}

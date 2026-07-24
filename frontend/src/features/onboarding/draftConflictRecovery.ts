import type {
  OnboardingConfiguration,
  OnboardingWorkspace,
} from "shared/onboarding";

interface RecoveryInput {
  baseConfiguration: OnboardingConfiguration;
  localConfiguration: OnboardingConfiguration;
  loadLatest: () => Promise<OnboardingWorkspace>;
  retry: (latestChecksum: string) => Promise<OnboardingWorkspace>;
}

export type DraftConflictResolution =
  | { status: "saved"; workspace: OnboardingWorkspace; retried: boolean }
  | { status: "conflict"; workspace: OnboardingWorkspace; retried: false };

export async function recoverSingleSessionDraftConflict(
  input: RecoveryInput,
): Promise<DraftConflictResolution> {
  const latest = await input.loadLatest();
  const latestSerialized = JSON.stringify(latest.draft.configuration);
  const localSerialized = JSON.stringify(input.localConfiguration);
  if (latestSerialized === localSerialized)
    return { status: "saved", workspace: latest, retried: false };
  if (latestSerialized !== JSON.stringify(input.baseConfiguration))
    return { status: "conflict", workspace: latest, retried: false };
  return {
    status: "saved",
    workspace: await input.retry(latest.draft.checksum),
    retried: true,
  };
}

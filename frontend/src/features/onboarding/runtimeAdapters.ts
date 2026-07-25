import type {
  OnboardingConfiguration,
  OnboardingWorkspace,
  ReadinessCheck,
  ReadinessResult,
} from "shared/onboarding";
import { DEFAULT_ONBOARDING_CONFIGURATION } from "shared/onboarding";
import type { CustomObjectDefinition } from "./models";

const readinessSectionMap: Record<string, string> = {
  branding: "brand",
  communications: "integrations",
  review: "publish",
  security: "recovery",
};

export function unwrapCollection<T>(value: unknown, ...keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as T[];
    }
  }
  return [];
}

export function normalizeReadinessResult(
  readiness: ReadinessResult,
): ReadinessResult {
  return {
    ...readiness,
    checks: readiness.checks.map(
      (check): ReadinessCheck => ({
        ...check,
        section: check.section
          ? (readinessSectionMap[check.section] ?? check.section)
          : check.section,
      }),
    ),
  };
}

export function normalizeOnboardingWorkspace(
  workspace: OnboardingWorkspace,
): OnboardingWorkspace {
  const normalizeConfiguration = (
    value: OnboardingConfiguration,
  ): OnboardingConfiguration => ({
    ...value,
    businessProfile: {
      ...DEFAULT_ONBOARDING_CONFIGURATION.businessProfile,
      ...(value.businessProfile ?? {}),
    },
    dataModel: {
      ...DEFAULT_ONBOARDING_CONFIGURATION.dataModel,
      ...(value.dataModel ?? {}),
    },
  });
  return {
    ...workspace,
    draft: {
      ...workspace.draft,
      configuration: normalizeConfiguration(workspace.draft.configuration),
    },
    published: workspace.published
      ? {
          ...workspace.published,
          configuration: normalizeConfiguration(
            workspace.published.configuration,
          ),
        }
      : null,
    readiness: normalizeReadinessResult(workspace.readiness),
  };
}

export function normalizeCustomObjectDefinitions(
  value: unknown,
): CustomObjectDefinition[] {
  return unwrapCollection<CustomObjectDefinition>(
    value,
    "items",
    "definitions",
  ).map((definition) => ({
    ...definition,
    fields: Array.isArray(definition.fields) ? definition.fields : [],
  }));
}

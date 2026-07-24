import { describe, expect, it, vi } from "vitest";
import type {
  OnboardingConfiguration,
  OnboardingWorkspace,
} from "shared/onboarding";
import { recoverSingleSessionDraftConflict } from "./draftConflictRecovery";

function configuration(name: string): OnboardingConfiguration {
  return { identity: { displayName: name } } as OnboardingConfiguration;
}

function workspace(name: string, checksum: string): OnboardingWorkspace {
  return {
    draft: { configuration: configuration(name), checksum },
  } as OnboardingWorkspace;
}

describe("single-session onboarding conflict recovery", () => {
  it("accepts the latest workspace when the first save committed before returning 409", async () => {
    const retry = vi.fn();
    const result = await recoverSingleSessionDraftConflict({
      baseConfiguration: configuration("Before"),
      localConfiguration: configuration("Local draft"),
      loadLatest: async () => workspace("Local draft", "a".repeat(64)),
      retry,
    });
    expect(result).toMatchObject({ status: "saved", retried: false });
    expect(retry).not.toHaveBeenCalled();
  });

  it("reconciles the latest checksum and retries the local draft once", async () => {
    const retry = vi.fn(async (checksum: string) =>
      workspace("Local draft", checksum),
    );
    const result = await recoverSingleSessionDraftConflict({
      baseConfiguration: configuration("Before"),
      localConfiguration: configuration("Local draft"),
      loadLatest: async () => workspace("Before", "b".repeat(64)),
      retry,
    });
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith("b".repeat(64));
    expect(result).toMatchObject({ status: "saved", retried: true });
  });

  it("does not overwrite a genuine concurrent edit", async () => {
    const retry = vi.fn();
    const result = await recoverSingleSessionDraftConflict({
      baseConfiguration: configuration("Before"),
      localConfiguration: configuration("Local draft"),
      loadLatest: async () => workspace("Other session", "c".repeat(64)),
      retry,
    });
    expect(result).toMatchObject({ status: "conflict", retried: false });
    expect(retry).not.toHaveBeenCalled();
  });

  it("surfaces a failed retry after exactly one attempt", async () => {
    const retry = vi.fn(async () => {
      throw new Error("second conflict");
    });
    await expect(
      recoverSingleSessionDraftConflict({
        baseConfiguration: configuration("Before"),
        localConfiguration: configuration("Local draft"),
        loadLatest: async () => workspace("Before", "d".repeat(64)),
        retry,
      }),
    ).rejects.toThrow("second conflict");
    expect(retry).toHaveBeenCalledOnce();
  });
});

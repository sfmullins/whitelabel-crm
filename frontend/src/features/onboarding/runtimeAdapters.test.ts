import { describe, expect, it } from "vitest";
import type { OnboardingWorkspace, ReadinessResult } from "shared/onboarding";
import {
  normalizeCustomObjectDefinitions,
  normalizeOnboardingWorkspace,
  normalizeReadinessResult,
  unwrapCollection,
} from "./runtimeAdapters";

describe("onboarding runtime adapters", () => {
  it("unwraps both array and keyed collection responses", () => {
    expect(unwrapCollection<number>([1, 2], "items")).toEqual([1, 2]);
    expect(
      unwrapCollection<number>({ roles: [3, 4] }, "roles", "items"),
    ).toEqual([3, 4]);
    expect(unwrapCollection<number>({ items: [5] }, "roles", "items")).toEqual([
      5,
    ]);
    expect(
      unwrapCollection<number>({ unexpected: true }, "roles", "items"),
    ).toEqual([]);
  });

  it("maps backend readiness sections to valid provisioning navigation keys", () => {
    const readiness = {
      checks: [
        { id: "brand", section: "branding" },
        { id: "comms", section: "communications" },
        { id: "review", section: "review" },
        { id: "security", section: "security" },
        { id: "people", section: "people" },
      ],
    } as unknown as ReadinessResult;
    expect(
      normalizeReadinessResult(readiness).checks.map((check) => check.section),
    ).toEqual(["brand", "integrations", "publish", "recovery", "people"]);
  });

  it("normalizes workspace readiness and legacy draft additions", () => {
    const workspace = {
      readiness: { checks: [{ id: "brand", section: "branding" }] },
      draft: { configuration: { schemaVersion: 1 } },
    } as unknown as OnboardingWorkspace;
    const normalized = normalizeOnboardingWorkspace(workspace);
    expect(normalized.readiness.checks[0].section).toBe("brand");
    expect(normalized.draft.configuration.businessProfile).toMatchObject({
      sector: "general",
      confirmed: false,
    });
    expect(normalized.draft.configuration.dataModel).toEqual({
      mode: "template",
      templateKey: "b2b-services",
      appliedTemplateKey: "",
    });
  });

  it("normalizes custom entity definitions returned without embedded fields", () => {
    const definitions = normalizeCustomObjectDefinitions([
      {
        id: "entity-1",
        name: "Site",
        apiName: "site",
        pluralName: "Sites",
        description: null,
      },
    ]);
    expect(definitions).toEqual([
      {
        id: "entity-1",
        name: "Site",
        apiName: "site",
        pluralName: "Sites",
        description: null,
        fields: [],
      },
    ]);
  });

  it("unwraps definition envelopes and preserves embedded fields", () => {
    const fields = [
      {
        id: "field-1",
        name: "reference",
        label: "Reference",
        type: "text",
        required: false,
      },
    ];
    expect(
      normalizeCustomObjectDefinitions({
        definitions: [
          {
            id: "entity-1",
            name: "Site",
            apiName: "site",
            pluralName: "Sites",
            description: null,
            fields,
          },
        ],
      }),
    ).toEqual([
      {
        id: "entity-1",
        name: "Site",
        apiName: "site",
        pluralName: "Sites",
        description: null,
        fields,
      },
    ]);
  });
});

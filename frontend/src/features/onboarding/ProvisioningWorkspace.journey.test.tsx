import { act, create, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ONBOARDING_CONFIGURATION,
  type OnboardingWorkspace,
} from "shared/onboarding";
import ProvisioningWorkspace from "./ProvisioningWorkspace";
import { useProvisioningWorkspace } from "./useProvisioningWorkspace";

vi.mock("./useProvisioningWorkspace", () => ({
  useProvisioningWorkspace: vi.fn(),
}));

const sections = [
  ["Your business", "Part of initial setup"],
  ["How you do business", "Part of initial setup"],
  ["Your customer records", "Part of initial setup"],
  ["How people connect", "Part of initial setup"],
  ["Look & feel", "Part of initial setup"],
  ["Business defaults", "Part of initial setup"],
  ["Your team", "Part of initial setup"],
  ["Keep your data safe", "Part of initial setup"],
  ["Check & finish", "Part of initial setup"],
] as const;

function nodeText(node: ReactTestInstance | string | number): string {
  if (typeof node === "string" || typeof node === "number")
    return String(node);
  return node.children.map((child) => nodeText(child)).join("");
}

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  const matches = root
    .findAllByType("button")
    .filter((candidate) => nodeText(candidate).includes(label));
  expect(matches, `button containing "${label}"`).toHaveLength(1);
  return matches[0];
}

function navigationButton(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance {
  const navigation = root.findAllByType("nav");
  expect(navigation).toHaveLength(1);
  return button(navigation[0], label);
}

function studioFixture() {
  const configuration = structuredClone(DEFAULT_ONBOARDING_CONFIGURATION);
  configuration.deployment = {
    ...configuration.deployment,
    mode: "standalone",
    instanceSlug: "acceptance-fixture",
    distributionMethod: "standalone",
  };
  configuration.identity = {
    ...configuration.identity,
    displayName: "Acceptance Fixture Ltd",
    legalName: "Acceptance Fixture Ltd",
    email: "owner@example.invalid",
    phone: "+353 1 000 0000",
    address: "Ireland",
    supportEmail: "support@example.invalid",
  };
  configuration.security = {
    ...configuration.security,
    backupConfigured: true,
    backupEncryptionConfirmed: true,
    restoreRehearsed: true,
    recoveryPlanConfirmed: true,
    retentionPolicyReviewed: true,
  };
  const workspace = {
    instance: {
      id: "instance-1",
      slug: "acceptance-fixture",
      status: "provisioning",
    },
    draft: {
      id: "draft-1",
      revision: 3,
      state: "draft",
      checksum: "a".repeat(64),
      configuration,
    },
    published: null,
    history: [],
    readiness: {
      score: 100,
      publishable: true,
      checks: [],
    },
    deploymentProfileAvailable: false,
  } as unknown as OnboardingWorkspace;
  const publish = vi.fn(async () => undefined);
  return {
    state: {
      workspace,
      draft: configuration,
      profile: null,
      roles: [],
      teams: [],
      users: [],
      fields: [],
      objects: [
        {
          id: "definition-without-embedded-fields",
          name: "Property",
          apiName: "property",
          pluralName: "Properties",
          description: null,
          fields: undefined,
        },
      ],
      extensions: [],
      accounts: [],
      enrolments: [],
      devices: [],
      imports: [],
    },
    saveState: "saved",
    message: "",
    setMessage: vi.fn(),
    working: null,
    patch: vi.fn(),
    updateTerm: vi.fn(),
    validate: vi.fn(),
    publish,
    rollback: vi.fn(),
    uploadBrandAsset: vi.fn(),
    createTeam: vi.fn(),
    createUser: vi.fn(),
    createField: vi.fn(),
    createObject: vi.fn(),
    applyDataModelTemplate: vi.fn(),
    deleteField: vi.fn(),
    deleteObject: vi.fn(),
    renameField: vi.fn(),
    renameObject: vi.fn(),
    testAccount: vi.fn(),
    toggleExtension: vi.fn(),
    createEnrolment: vi.fn(),
    revokeEnrolment: vi.fn(),
    revokeDevice: vi.fn(),
    loadImportFile: vi.fn(),
    previewImport: vi.fn(),
    commitImport: vi.fn(),
    importWorkspace: {
      fileName: "",
      csvData: "",
      preview: null,
      mapping: {},
      duplicateStrategy: "skip" as const,
    },
    setImportWorkspace: vi.fn(),
    downloadDeploymentFiles: vi.fn(),
    selectedExtensions: new Map(),
    reload: vi.fn(),
    flushDraft: vi.fn(),
  };
}

describe("provisioning workspace user journey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("guides an owner through nine plain-language steps and finishes setup", async () => {
    const studio = studioFixture();
    vi.mocked(useProvisioningWorkspace).mockReturnValue(studio as never);
    const renderer = create(<ProvisioningWorkspace />);

    for (const [label, requirement] of sections) {
      await act(async () => {
        navigationButton(renderer.root, label).props.onClick();
      });
      const activeHeading = renderer.root
        .findAllByType("h2")
        .filter((heading) => nodeText(heading) === label);
      expect(activeHeading, `${label} heading`).toHaveLength(1);
      expect(
        renderer.root
          .findAllByType("span")
          .some(
            (badge) => nodeText(badge) === requirement,
          ),
      ).toBe(true);
      expect(
        renderer.root
          .findAllByType("p")
          .some((paragraph) => nodeText(paragraph) === "Before you continue"),
      ).toBe(true);
    }

    const approval = renderer.root
      .findAllByType("input")
      .filter((input) => input.props.type === "checkbox");
    expect(approval).toHaveLength(1);
    await act(async () => {
      approval[0].props.onChange({ target: { checked: true } });
    });
    const publish = button(renderer.root, "Finish setup");
    expect(publish.props.disabled).toBe(false);
    await act(async () => {
      publish.props.onClick();
    });
    expect(studio.publish).toHaveBeenCalledOnce();
  });

  it("keeps add-ons behind optional and advanced setup", async () => {
    vi.mocked(useProvisioningWorkspace).mockReturnValue(
      studioFixture() as never,
    );
    const renderer = create(<ProvisioningWorkspace />);
    await act(async () => {
      navigationButton(renderer.root, "Optional & advanced setup").props.onClick();
    });
    await act(async () => {
      navigationButton(renderer.root, "Add-ons").props.onClick();
    });

    const rendered = nodeText(renderer.root);
    expect(rendered).toContain("Extensions are optional");
    expect(rendered).toContain(
      "package installation becomes available after the initial instance is published",
    );
    expect(rendered).not.toContain("Manage packages");
  });

  it("uses the owner's sector choice to drive specialist template recommendations", async () => {
    const studio = studioFixture();
    vi.mocked(useProvisioningWorkspace).mockReturnValue(studio as never);
    const renderer = create(<ProvisioningWorkspace />);
    await act(async () => {
      navigationButton(renderer.root, "How you do business").props.onClick();
    });
    await act(async () => {
      button(renderer.root, "Veterinary practice").props.onClick();
    });

    expect(studio.patch).toHaveBeenCalledWith("businessProfile", {
      sector: "veterinary",
    });
  });

  it("renders custom entities whose API response omitted embedded fields", async () => {
    vi.mocked(useProvisioningWorkspace).mockReturnValue(
      studioFixture() as never,
    );
    const renderer = create(<ProvisioningWorkspace />);
    await act(async () => {
      navigationButton(renderer.root, "Your customer records").props.onClick();
    });
    await act(async () => {
      button(renderer.root, "Customise fields and records").props.onClick();
    });

    expect(nodeText(renderer.root)).toContain("Property");
    expect(nodeText(renderer.root)).toContain("0 fields");
  });

  it("names every missing business answer before publication", () => {
    const studio = studioFixture();
    studio.state.workspace.readiness.checks = [
      {
        id: "identity.complete",
        category: "identity",
        status: "failed",
        severity: "required",
        title: "Business identity",
        explanation: "Incomplete",
        remediation: "Complete the Business identity section.",
        section: "identity",
        evidence: {
          displayName: false,
          email: true,
          phone: false,
          address: false,
        },
      },
    ];
    studio.state.workspace.readiness.publishable = false;
    vi.mocked(useProvisioningWorkspace).mockReturnValue(studio as never);
    const renderer = create(<ProvisioningWorkspace />);

    const rendered = nodeText(renderer.root);
    expect(rendered).toContain("1 item needed before you can finish");
    expect(rendered).toContain(
      "Add: business name, phone number, business address.",
    );
    expect(
      renderer.root
        .findAllByType("span")
        .filter((span) => nodeText(span) === "Needed to publish"),
    ).toHaveLength(4);
  });
});

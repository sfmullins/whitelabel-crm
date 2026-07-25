import { useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  Download,
  FileSpreadsheet,
  Globe2,
  KeyRound,
  Laptop,
  Layers3,
  Loader2,
  Mail,
  Palette,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Users,
  Workflow,
  XCircle,
} from "lucide-react";
import type {
  OnboardingConfiguration,
  ReadinessCheck,
} from "shared/onboarding";
import type { OnboardingImportMapping } from "shared/onboarding-import";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useProvisioningWorkspace } from "./useProvisioningWorkspace";
import type { ProvisioningSection } from "./models";
import { rankDataModelTemplates } from "./dataModelTemplates";

interface ProvisioningWorkspaceProps {
  onSuccess?: () => void;
}
interface NavItem {
  key: ProvisioningSection;
  label: string;
  description: string;
  icon: typeof Sparkles;
  requirement: "Required" | "Optional" | "Conditional";
  completion: string;
}
const navigation: NavItem[] = [
  {
    key: "business-fit",
    label: "How you do business",
    description: "Help us suggest the right customer records",
    icon: Store,
    requirement: "Required",
    completion:
      "Choose the answers that best describe the business. We use them only to rank suitable starting templates.",
  },
  {
    key: "identity",
    label: "Your business",
    description: "The essentials we need to get started",
    icon: Building2,
    requirement: "Required",
    completion:
      "Add the four essentials marked “Needed to publish”. Everything else can wait.",
  },
  {
    key: "brand",
    label: "Look & feel",
    description: "Logo and colours your team will see",
    icon: Palette,
    requirement: "Required",
    completion:
      "Choose a main colour with readable contrast. The other design settings already have safe defaults.",
  },
  {
    key: "locale",
    label: "Business defaults",
    description: "Currency, dates and working preferences",
    icon: Globe2,
    requirement: "Required",
    completion:
      "Check the suggested regional and financial defaults. Change only what is wrong for your business.",
  },
  {
    key: "people",
    label: "Your team",
    description: "Who can use the CRM and what they can do",
    icon: Users,
    requirement: "Required",
    completion:
      "Your owner account is enough to publish. Add colleagues now only if you are ready.",
  },
  {
    key: "recovery",
    label: "Keep your data safe",
    description: "Simple backup and recovery checks",
    icon: ShieldCheck,
    requirement: "Required",
    completion:
      "For a shared business system, confirm where backups go, that they are encrypted and who will recover them.",
  },
  {
    key: "publish",
    label: "Check & finish",
    description: "See exactly what remains, then open the CRM",
    icon: CheckCircle2,
    requirement: "Required",
    completion:
      "Complete any items marked “Needed to publish”, approve the summary and finish setup.",
  },
  {
    key: "deployment",
    label: "How people connect",
    description: "Single computer or shared team access",
    icon: Cloud,
    requirement: "Required",
    completion:
      "Choose whether this CRM lives on one computer or is shared by your team. Technical defaults are handled for you.",
  },
  {
    key: "readiness",
    label: "Setup details",
    description: "Full checks and diagnostic evidence",
    icon: Sparkles,
    requirement: "Optional",
    completion:
      "This detailed view is for support and troubleshooting. You do not need to understand it to finish setup.",
  },
  {
    key: "terminology",
    label: "Words you use",
    description: "Rename CRM terms to suit your business",
    icon: Workflow,
    requirement: "Optional",
    completion:
      "Keep the defaults or tailor the labels to the business vocabulary.",
  },
  {
    key: "data-model",
    label: "Your customer records",
    description: "Choose a suggested starting point or build your own",
    icon: Layers3,
    requirement: "Required",
    completion:
      "Choose a recommended template or a blank model. Templates remain fully editable and can be changed later.",
  },
  {
    key: "import",
    label: "Bring in existing data",
    description: "Import customers from a spreadsheet",
    icon: FileSpreadsheet,
    requirement: "Optional",
    completion:
      "Import now only if clean source data is ready. Data can also be imported after publication.",
  },
  {
    key: "integrations",
    label: "Email & calendar",
    description: "Optional connections after setup",
    icon: Mail,
    requirement: "Optional",
    completion:
      "Set communication defaults now or leave integrations disabled and configure accounts after publication.",
  },
  {
    key: "extensions",
    label: "Add-ons",
    description: "Optional extra capabilities",
    icon: Plug,
    requirement: "Optional",
    completion:
      "Extensions are not required for publication. Select only packages already installed and enabled.",
  },
  {
    key: "employees",
    label: "Invite employees",
    description: "Give colleagues secure access",
    icon: KeyRound,
    requirement: "Conditional",
    completion:
      "Define rollout policy now; issue enrolment tokens only when employees are ready to activate.",
  },
];
const commonTimezones = new Set([
  "Europe/Dublin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
]);

const coreSectionOrder: ProvisioningSection[] = [
  "identity",
  "business-fit",
  "data-model",
  "deployment",
  "brand",
  "locale",
  "people",
  "recovery",
  "publish",
];
const coreSectionKeys = new Set(coreSectionOrder);
const coreNavigation = coreSectionOrder.map(
  (key) => navigation.find((item) => item.key === key)!,
);

export default function ProvisioningWorkspace({
  onSuccess,
}: ProvisioningWorkspaceProps) {
  const studio = useProvisioningWorkspace(onSuccess);
  const [section, setSection] = useState<ProvisioningSection>("identity");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const state = studio.state;
  if (!state)
    return (
      <LoadingState
        error={studio.saveState === "error" ? studio.message : null}
      />
    );
  const active = navigation.find((item) => item.key === section)!;
  const blockers = state.workspace.readiness.checks.filter(
    (check) => check.severity === "required" && check.status === "failed",
  );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-lg">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-blue-500/15 p-2.5">
              <Sparkles className="h-5 w-5 text-blue-300" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black">Set up your CRM</h1>
              <p className="truncate text-xs text-slate-400">
                We save your answers automatically
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator state={studio.saveState} />
            <Button
              variant="outline"
              className="border-slate-700 bg-transparent text-white hover:bg-slate-800"
              onClick={() => void studio.validate()}
              disabled={studio.working === "validate"}
            >
              {studio.working === "validate" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Check my setup
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1700px] grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="border-r bg-white p-4 lg:min-h-[calc(100vh-73px)]">
          <ReadinessCard
            score={state.workspace.readiness.score}
            blockers={blockers.length}
          />
          <p className="mt-5 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Get ready to use your CRM
          </p>
          <nav className="mt-2 space-y-1" aria-label="Setup sections">
            {coreNavigation.map((item) => {
              const Icon = item.icon;
              const hasFailure = state.workspace.readiness.checks.some(
                (check) =>
                  check.section === item.key && check.status === "failed",
              );
              return (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${section === item.key ? "bg-slate-950 text-white shadow" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${hasFailure ? "text-red-400" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">
                      {item.label}
                    </span>
                    <span
                      className={`block truncate text-[11px] ${section === item.key ? "text-slate-400" : "text-slate-500"}`}
                    >
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-40" />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              Optional & advanced setup
              <ChevronRight className={`h-4 w-4 transition ${showAdvanced ? "rotate-90" : ""}`} />
            </button>
            {showAdvanced &&
              navigation
                .filter((item) => !coreSectionKeys.has(item.key))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setSection(item.key)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${section === item.key ? "bg-slate-950 text-white shadow" : "text-slate-700 hover:bg-slate-100"}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black">{item.label}</span>
                        <span className={`block truncate text-[11px] ${section === item.key ? "text-slate-400" : "text-slate-500"}`}>{item.description}</span>
                      </span>
                    </button>
                  );
                })}
          </nav>
        </aside>
        <main className="min-w-0 p-4 md:p-8">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                Step {coreNavigation.findIndex((item) => item.key === section) + 1 || "Optional"} of {coreNavigation.length}
              </p>
              <RequirementBadge value={active.requirement} />
            </div>
            <h2 className="mt-1 text-3xl font-black tracking-tight">
              {active.label}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {active.description}.
            </p>
          </div>
          {studio.message && <Notice>{studio.message}</Notice>}
          {section === "readiness" && <ReadinessSection studio={studio} />}{" "}
          {section === "deployment" && <DeploymentSection studio={studio} />}{" "}
          {section === "identity" && <IdentitySection studio={studio} />}{" "}
          {section === "business-fit" && <BusinessFitSection studio={studio} onContinue={()=>setSection("data-model")} />}{" "}
          {section === "brand" && <BrandSection studio={studio} />}{" "}
          {section === "locale" && <LocaleSection studio={studio} />}{" "}
          {section === "terminology" && <TerminologySection studio={studio} />}{" "}
          {section === "people" && <PeopleSection studio={studio} />}{" "}
          {section === "data-model" && <DataModelSection studio={studio} />}{" "}
          {section === "import" && <ImportSection studio={studio} />}{" "}
          {section === "integrations" && (
            <IntegrationsSection studio={studio} />
          )}{" "}
          {section === "extensions" && <ExtensionsSection studio={studio} />}{" "}
          {section === "recovery" && <RecoverySection studio={studio} />}{" "}
          {section === "employees" && <EmployeesSection studio={studio} />}{" "}
          {section === "publish" && (
            <PublishSection studio={studio} onSelect={setSection} />
          )}
          <SectionCompletion
            item={active}
            onContinue={(next) => setSection(next)}
          />
        </main>
        <aside className="border-l bg-white p-5 lg:min-h-[calc(100vh-73px)]">
          <PublicationChecklist
            checks={state.workspace.readiness.checks}
            onSelect={setSection}
          />
          <div className="mt-6"><LivePreview value={state.draft} /></div>
          <div className="mt-6">
            <h3 className="text-sm font-black">Required actions</h3>
            <div className="mt-3 space-y-2">
              {blockers.length ? (
                blockers.slice(0, 7).map((check) => (
                  <button
                    key={check.id}
                    onClick={() =>
                      setSection(
                        (check.section as ProvisioningSection) || "readiness",
                      )
                    }
                    className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-left"
                  >
                    <p className="text-xs font-black text-red-950">
                      {check.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-red-700">
                      {check.remediation}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <Check className="mb-2 h-5 w-5" />
                  All mandatory publication gates currently pass.
                </div>
              )}
            </div>
          </div>
          {showAdvanced && <ModuleEvidence studio={studio} />}
        </aside>
      </div>
    </div>
  );
}

type Studio = ReturnType<typeof useProvisioningWorkspace>;
function LoadingState({ error }: { error: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-300">
      {error ? (
        <div className="max-w-lg rounded-2xl border border-red-900 bg-red-950/40 p-6 text-red-200">
          <XCircle className="mb-3 h-6 w-6" />
          {error}
        </div>
      ) : (
        <>
          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
          Opening the instance provisioning studio…
        </>
      )}
    </div>
  );
}
function SaveIndicator({ state }: { state: string }) {
  const problem = state === "error" || state === "conflict";
  return (
    <div
      className={`hidden items-center gap-2 text-xs font-bold sm:flex ${problem ? "text-red-300" : state === "unsaved" ? "text-amber-300" : "text-slate-300"}`}
    >
      {state === "saving" || state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : problem ? (
        <XCircle className="h-4 w-4" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {state === "saving"
        ? "Saving draft…"
        : state === "loading"
          ? "Loading…"
          : state === "unsaved"
            ? "Unsaved changes"
            : state === "conflict"
              ? "Draft conflict"
              : state === "error"
                ? "Draft not saved"
                : "Draft saved"}
    </div>
  );
}
function ReadinessCard({
  score: _score,
  blockers,
}: {
  score: number;
  blockers: number;
}) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Still needed
          </p>
          <p className="mt-1 text-3xl font-black">{blockers}</p>
        </div>
        {blockers ? (
          <AlertCircle className="h-8 w-8 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {blockers
          ? `item${blockers === 1 ? "" : "s"} needed before you can finish`
          : "You have answered everything needed to finish"}
      </p>
    </div>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
function RequirementBadge({ value }: { value: NavItem["requirement"] }) {
  const colour =
    value === "Required"
      ? "bg-red-100 text-red-800"
      : value === "Optional"
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-800";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${colour}`}
    >
      {value === "Required" ? "Part of initial setup" : value}
    </span>
  );
}
function SectionCompletion({
  item,
  onContinue,
}: {
  item: NavItem;
  onContinue: (next: ProvisioningSection) => void;
}) {
  const journey = coreNavigation;
  const index = journey.findIndex((candidate) => candidate.key === item.key);
  const next = index >= 0 ? journey[index + 1] : undefined;
  return (
    <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-blue-950">
              Before you continue
            </p>
            <RequirementBadge value={item.requirement} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-900">
            {item.completion}
          </p>
        </div>
        {next && (
          <Button onClick={() => onContinue(next.key)}>
            Continue to {next.label}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </section>
  );
}
function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  hint,
  required,
  missing,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  missing?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`block space-y-1.5 rounded-xl ${missing ? "bg-red-50 p-3 ring-1 ring-red-200" : ""}`}>
      <span className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-700">
        {label}
        {required && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] uppercase tracking-wider text-red-800">
            Needed to publish
          </span>
        )}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] leading-relaxed text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function PublicationChecklist({
  checks,
  onSelect,
}: {
  checks: ReadinessCheck[];
  onSelect: (section: ProvisioningSection) => void;
}) {
  const required = checks.filter((check) => check.severity === "required");
  const missing = required.filter((check) => check.status === "failed");
  return (
    <section className={`rounded-2xl border p-5 ${missing.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <p className="text-sm font-black">
        {missing.length ? `${missing.length} item${missing.length === 1 ? "" : "s"} needed before you can finish` : "Ready to finish setup"}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        {missing.length
          ? "Select an item to go straight to the answer we need."
          : "All required answers and safety checks are complete."}
      </p>
      <div className="mt-4 space-y-2">
        {missing.map((check) => (
          <button
            key={check.id}
            type="button"
            onClick={() => onSelect(sectionForCheck(check))}
            className="flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-white p-3 text-left hover:border-amber-400"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <span className="block text-xs font-black text-slate-900">{plainCheckTitle(check)}</span>
              <span className="mt-1 block text-[11px] leading-5 text-slate-600">{plainCheckAction(check)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function sectionForCheck(check: ReadinessCheck): ProvisioningSection {
  const aliases: Record<string, ProvisioningSection> = {
    branding: "brand",
    security: "recovery",
    review: "publish",
    communications: "integrations",
  };
  return aliases[check.section] ?? (check.section as ProvisioningSection);
}

function plainCheckTitle(check: ReadinessCheck) {
  const labels: Record<string, string> = {
    "configuration.schema": "One or more answers need correcting",
    "identity.complete": "Business contact details",
    "business-profile.confirmed": "How your business works",
    "data-model.selected": "Your customer-record starting point",
    "deployment.topology": "How people will connect",
    "branding.contrast": "A readable main colour",
    "permissions.owner": "An active business owner",
    "employees.default-role": "Default access for employees",
    "recovery.viable": "Backup and recovery confirmations",
    "extensions.compatible": "Unavailable add-on selected",
    "configuration.secret-free": "Sensitive information in setup answers",
  };
  return labels[check.id] ?? check.title;
}

function plainCheckAction(check: ReadinessCheck) {
  if (check.id === "identity.complete") {
    const evidence = check.evidence as Record<string, boolean>;
    const fields = [
      !evidence.displayName && "business name",
      !evidence.email && "email address",
      !evidence.phone && "phone number",
      !evidence.address && "business address",
    ].filter(Boolean);
    return `Add: ${fields.join(", ")}.`;
  }
  if (check.id === "recovery.viable") {
    const evidence = check.evidence as Record<string, boolean>;
    const fields = [
      !evidence.backupConfigured && "where backups will be kept",
      !evidence.backupEncryptionConfirmed && "backup encryption",
      !evidence.recoveryPlanConfirmed && "who will recover the system",
    ].filter(Boolean);
    return `Confirm: ${fields.join(", ")}.`;
  }
  if (check.id === "configuration.schema") {
    const issues = (check.evidence as { issues?: Array<{ path: string; message: string }> }).issues ?? [];
    return issues.length
      ? issues
          .slice(0, 2)
          .map((issue) => `${friendlyFieldName(issue.path)}: ${issue.message}`)
          .join(" · ")
      : "Open this item to review the answer that needs attention.";
  }
  return check.remediation || check.explanation;
}

function friendlyFieldName(path: string) {
  const labels: Record<string, string> = {
    "identity.displayName": "Business name",
    "identity.email": "Main business email",
    "identity.phone": "Main phone number",
    "identity.address": "Business address",
    "deployment.instanceUrl": "CRM web address",
    "branding.primaryColor": "Main brand colour",
    "locale.currency": "Currency",
    "locale.timezone": "Timezone",
    "financial.defaultTaxRate": "Default tax rate",
    "employees.defaultRoleKey": "Default employee access",
  };
  if (labels[path]) return labels[path];
  return path
    .split(".")
    .at(-1)!
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${props.className ?? ""}`}
    />
  );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${props.className ?? ""}`}
    />
  );
}
function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
          aria-label={`${label} colour`}
        />
        <Input
          value={value}
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  );
}
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-blue-600"
      />
      <span>
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}
function ListField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Textarea
        rows={4}
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    </Field>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-slate-500">{detail}</p>}
    </div>
  );
}
function CheckIcon({ status }: { status: ReadinessCheck["status"] }) {
  return status === "passed" ? (
    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
  ) : status === "failed" ? (
    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
  ) : (
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
  );
}

function ReadinessSection({ studio }: { studio: Studio }) {
  const state = studio.state!;
  const groups = useMemo(() => {
    const map = new Map<string, ReadinessCheck[]>();
    for (const check of state.workspace.readiness.checks)
      map.set(check.category, [...(map.get(check.category) ?? []), check]);
    return [...map.entries()];
  }, [state.workspace.readiness]);
  return (
    <div className="space-y-5">
      <Panel
        title="Answer-first publication status"
        description="Required failures stop publication. Warnings remain visible and evidence-backed without being disguised as failures."
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Metric label="Score" value={`${state.workspace.readiness.score}%`} />
          <Metric label="Passed" value={state.workspace.readiness.passed} />
          <Metric label="Warnings" value={state.workspace.readiness.warnings} />
          <Metric label="Failures" value={state.workspace.readiness.failures} />
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map(([category, checks]) => (
          <Panel key={category} title={category.replace(/-/g, " ")}>
            <div className="space-y-3">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-3 rounded-xl border p-3"
                >
                  <CheckIcon status={check.status} />
                  <div>
                    <p className="text-sm font-black">{check.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {check.explanation}
                    </p>
                    {check.status !== "passed" && check.remediation && (
                      <p className="mt-2 text-xs font-bold text-slate-700">
                        Next: {check.remediation}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Implementation evidence">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="People"
            value={state.users.length}
            detail={`${state.teams.length} teams · ${state.roles.length} roles`}
          />
          <Metric
            label="Schema"
            value={state.fields.length + state.objects.length}
            detail={`${state.fields.length} fields · ${state.objects.length} entities`}
          />
          <Metric
            label="Connections"
            value={state.accounts.filter((item) => item.enabled).length}
            detail={`${state.accounts.length} configured accounts`}
          />
          <Metric
            label="Extensions"
            value={state.draft.extensions.filter((item) => item.enabled).length}
            detail={`${state.extensions.length} installed packages`}
          />
        </div>
      </Panel>
    </div>
  );
}

function DeploymentSection({ studio }: { studio: Studio }) {
  const value = studio.state!.draft;
  const managed = value.deployment.mode === "managed";
  const [showTechnical, setShowTechnical] = useState(false);
  return (
    <div className="space-y-5">
      <Panel
        title="Will the CRM be shared?"
        description="Most businesses with more than one user should choose the shared option. A single-computer CRM is only for one person working on one device."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Choice
            selected={managed}
            icon={<Cloud />}
            title="Shared with my team"
            description="Recommended for teams. Everyone works from the same customer records, whether they use the desktop app or a browser."
            onClick={() =>
              studio.patch("deployment", {
                mode: "managed",
                distributionMethod: "browser",
              })
            }
          />
          <Choice
            selected={!managed}
            icon={<Laptop />}
            title="Only on this computer"
            description="Choose this only when one person will use the CRM on this device. It will not sync with another installation."
            onClick={() =>
              studio.patch("deployment", {
                mode: "standalone",
                distributionMethod: "standalone",
                instanceUrl: "",
              })
            }
          />
        </div>
      </Panel>
      <Panel
        title="Connection details"
        description="If Good Order or another provider is hosting the CRM, they should supply the secure web address. The other settings already have safe defaults."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {managed && (
            <Field
              label="CRM web address"
              hint="Needed for shared access. Enter the secure https:// address supplied by whoever hosts the CRM."
              required
              missing={!value.deployment.instanceUrl.trim()}
            >
              <Input
                value={value.deployment.instanceUrl}
                placeholder="https://crm.example.ie"
                onChange={(event) =>
                  studio.patch("deployment", {
                    instanceUrl: event.target.value,
                  })
                }
              />
            </Field>
          )}
          <Field label="Rough number of users" hint="An estimate is fine. This helps size the installation and does not limit your account.">
            <Input
              type="number"
              min={1}
              max={100000}
              value={value.deployment.expectedUsers}
              onChange={(event) =>
                studio.patch("deployment", {
                  expectedUsers: Number(event.target.value),
                })
              }
            />
          </Field>
        </div>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => setShowTechnical((current) => !current)}
        >
          {showTechnical
            ? "Hide advanced connection settings"
            : "Advanced connection settings"}
        </Button>
        {showTechnical && (
          <div className="mt-4 grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2">
            <Field
              label="Internal system name"
              hint="Keep the suggested value unless your installer or support provider says otherwise."
            >
              <Input
                value={value.deployment.instanceSlug}
                onChange={(event) =>
                  studio.patch("deployment", {
                    instanceSlug: event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, ""),
                  })
                }
              />
            </Field>
            <Field label="Oldest supported app version">
              <Input
                value={value.deployment.minimumClientVersion}
                onChange={(event) =>
                  studio.patch("deployment", {
                    minimumClientVersion: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="How employees will open the CRM">
              <Select
                value={value.deployment.distributionMethod}
                onChange={(event) =>
                  studio.patch("deployment", {
                    distributionMethod: event.target
                      .value as OnboardingConfiguration["deployment"]["distributionMethod"],
                  })
                }
              >
                <option value="managed-installer">Managed installer</option>
                <option value="portable">Portable client</option>
                <option value="browser">Browser access</option>
                <option value="standalone">Standalone package</option>
              </Select>
            </Field>
            <ListField
              label="Locations"
              value={value.deployment.locations}
              onChange={(locations) =>
                studio.patch("deployment", { locations })
              }
              hint="One business location per line."
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
function Choice({
  selected,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border-2 p-5 text-left transition ${selected ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-400"}`}
    >
      <span
        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}
      >
        {icon}
      </span>
      <span className="block font-black">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-slate-600">
        {description}
      </span>
    </button>
  );
}

function IdentitySection({ studio }: { studio: Studio }) {
  const value = studio.state!.draft.identity;
  return (
    <Panel
      title="Tell us about your business"
      description="We use these details on screens, documents and customer records. Only four answers are needed to open the CRM; the rest can be added later."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Business or trading name"
          hint="The familiar name your customers and team use. This appears at the top of the CRM."
          required
          missing={!value.displayName.trim()}
        >
          <Input
            value={value.displayName}
            onChange={(event) =>
              studio.patch("identity", { displayName: event.target.value })
            }
          />
        </Field>
        <Field label="Registered legal name" hint="Optional. Add this if it differs from your trading name.">
          <Input
            value={value.legalName}
            onChange={(event) =>
              studio.patch("identity", { legalName: event.target.value })
            }
          />
        </Field>
        <Field label="Company registration number" hint="Optional. You can add this later for formal documents.">
          <Input
            value={value.registrationNumber}
            onChange={(event) =>
              studio.patch("identity", {
                registrationNumber: event.target.value,
              })
            }
          />
        </Field>
        <Field label="Tax or VAT number" hint="Optional during setup.">
          <Input
            value={value.taxIdentifier}
            onChange={(event) =>
              studio.patch("identity", { taxIdentifier: event.target.value })
            }
          />
        </Field>
        <Field
          label="Main business email"
          hint="Used as the default contact address. It does not connect your inbox."
          required
          missing={!value.email.includes("@")}
        >
          <Input
            type="email"
            value={value.email}
            onChange={(event) =>
              studio.patch("identity", { email: event.target.value })
            }
          />
        </Field>
        <Field
          label="Main phone number"
          hint="The number customers or employees should use for the business."
          required
          missing={!value.phone.trim()}
        >
          <Input
            value={value.phone}
            onChange={(event) =>
              studio.patch("identity", { phone: event.target.value })
            }
          />
        </Field>
        <Field label="Website" hint="Optional. Include https://, for example https://example.ie.">
          <Input
            value={value.website}
            placeholder="https://example.ie"
            onChange={(event) =>
              studio.patch("identity", { website: event.target.value })
            }
          />
        </Field>
        <Field label="Customer support email" hint="Optional. Leave blank to use the main business email.">
          <Input
            type="email"
            value={value.supportEmail}
            onChange={(event) =>
              studio.patch("identity", { supportEmail: event.target.value })
            }
          />
        </Field>
        <Field label="Privacy contact email" hint="Optional. The contact for data-access or privacy queries.">
          <Input
            type="email"
            value={value.privacyEmail}
            onChange={(event) =>
              studio.patch("identity", { privacyEmail: event.target.value })
            }
          />
        </Field>
        <Field
          label="Business address"
          hint="Used on business records and documents. A trading address is sufficient."
          required
          missing={!value.address.trim()}
        >
          <Textarea
            value={value.address}
            onChange={(event) =>
              studio.patch("identity", { address: event.target.value })
            }
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Business description">
            <Textarea
              value={value.description}
              onChange={(event) =>
                studio.patch("identity", { description: event.target.value })
              }
            />
          </Field>
        </div>
      </div>
    </Panel>
  );
}

function BrandSection({ studio }: { studio: Studio }) {
  const value = studio.state!.draft.branding;
  return (
    <div className="space-y-5">
      <Panel
        title="Add your logo"
        description="Optional. Add the logo your team and customers should see, or leave it blank and continue."
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50">
            {value.logoUrl ? (
              <img
                src={value.logoUrl}
                alt="Business logo preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Building2 className="h-10 w-10 text-slate-300" />
            )}
          </div>
          <div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={studio.working === "brand-asset"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void studio.uploadBrandAsset(file);
                event.currentTarget.value = "";
              }}
              className="block text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-950 file:px-4 file:py-2.5 file:font-bold file:text-white disabled:opacity-50"
            />
            <p className="mt-2 text-xs text-slate-500">
              Use a PNG, JPEG or WebP image up to 1 MB.
            </p>
          </div>
        </div>
      </Panel>
      <Panel title="Choose the look">
        <div className="grid gap-4 md:grid-cols-3">
          <ColourField
            label="Primary"
            value={value.primaryColor}
            onChange={(primaryColor) =>
              studio.patch("branding", { primaryColor })
            }
          />
          <ColourField
            label="Secondary"
            value={value.secondaryColor}
            onChange={(secondaryColor) =>
              studio.patch("branding", { secondaryColor })
            }
          />
          <ColourField
            label="Accent"
            value={value.accentColor}
            onChange={(accentColor) =>
              studio.patch("branding", { accentColor })
            }
          />
          <ColourField
            label="Surface"
            value={value.surfaceColor}
            onChange={(surfaceColor) =>
              studio.patch("branding", { surfaceColor })
            }
          />
          <ColourField
            label="Background"
            value={value.backgroundColor}
            onChange={(backgroundColor) =>
              studio.patch("branding", { backgroundColor })
            }
          />
          <Field label="Density">
            <Select
              value={value.density}
              onChange={(event) =>
                studio.patch("branding", {
                  density: event.target.value as "comfortable" | "compact",
                })
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </Select>
          </Field>
          <Field label="Corner style">
            <Select
              value={value.radius}
              onChange={(event) =>
                studio.patch("branding", {
                  radius: event.target.value as "square" | "subtle" | "rounded",
                })
              }
            >
              <option value="square">Square</option>
              <option value="subtle">Subtle</option>
              <option value="rounded">Rounded</option>
            </Select>
          </Field>
          <Toggle
            checked={value.darkModeEnabled}
            onChange={(darkModeEnabled) =>
              studio.patch("branding", { darkModeEnabled })
            }
            label="Dark mode available"
            description="Employees may use the bounded dark theme variant."
          />
        </div>
      </Panel>
    </div>
  );
}

function LocaleSection({ studio }: { studio: Studio }) {
  const value = studio.state!.draft.locale;
  return (
    <Panel title="Locale and regional settings">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Primary language">
          <Input
            value={value.language}
            onChange={(event) =>
              studio.patch("locale", { language: event.target.value })
            }
          />
        </Field>
        <Field label="Timezone">
          <Select
            value={value.timezone}
            onChange={(event) =>
              studio.patch("locale", { timezone: event.target.value })
            }
          >
            {!commonTimezones.has(value.timezone) ? (
              <option value={value.timezone}>{value.timezone} (saved setting)</option>
            ) : null}
            <option value="Europe/Dublin">Dublin (Ireland)</option>
            <option value="Europe/London">London (United Kingdom)</option>
            <option value="Europe/Lisbon">Lisbon (Portugal)</option>
            <option value="Europe/Paris">Paris (Central Europe)</option>
            <option value="Europe/Berlin">Berlin (Central Europe)</option>
            <option value="America/New_York">New York (Eastern Time)</option>
            <option value="America/Chicago">Chicago (Central Time)</option>
            <option value="America/Denver">Denver (Mountain Time)</option>
            <option value="America/Los_Angeles">Los Angeles (Pacific Time)</option>
            <option value="Australia/Sydney">Sydney (Australia)</option>
            <option value="UTC">UTC</option>
          </Select>
        </Field>
        <Field label="Currency">
          <Input
            maxLength={3}
            value={value.currency}
            onChange={(event) =>
              studio.patch("locale", {
                currency: event.target.value.toUpperCase(),
              })
            }
          />
        </Field>
        <Field label="Date format">
          <Select
            value={value.dateFormat}
            onChange={(event) =>
              studio.patch("locale", {
                dateFormat: event.target
                  .value as OnboardingConfiguration["locale"]["dateFormat"],
              })
            }
          >
            <option>DD/MM/YYYY</option>
            <option>MM/DD/YYYY</option>
            <option>YYYY-MM-DD</option>
          </Select>
        </Field>
        <Field label="Time format">
          <Select
            value={value.timeFormat}
            onChange={(event) =>
              studio.patch("locale", {
                timeFormat: event.target.value as "12h" | "24h",
              })
            }
          >
            <option value="24h">24 hour</option>
            <option value="12h">12 hour</option>
          </Select>
        </Field>
        <Field label="Week begins">
          <Select
            value={value.weekStartsOn}
            onChange={(event) =>
              studio.patch("locale", {
                weekStartsOn: event.target.value as "monday" | "sunday",
              })
            }
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </Select>
        </Field>
        <Field label="Financial year starts">
          <Select
            value={value.financialYearStartMonth}
            onChange={(event) =>
              studio.patch("locale", {
                financialYearStartMonth: Number(event.target.value),
              })
            }
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {new Date(2020, index, 1).toLocaleString(
                  value.language || "en",
                  { month: "long" },
                )}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Panel>
  );
}
function TerminologySection({ studio }: { studio: Studio }) {
  const value = studio.state!.draft.terminology;
  return (
    <Panel
      title="Business terminology"
      description="Presentation labels change without renaming stable database or API contracts."
    >
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-3">Core concept</th>
              <th className="p-3">Singular</th>
              <th className="p-3">Plural</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(value) as Array<keyof typeof value>).map((key) => (
              <tr key={key} className="border-t">
                <td className="p-3 font-black capitalize">{key}</td>
                <td className="p-3">
                  <Input
                    value={value[key].singular}
                    onChange={(event) =>
                      studio.updateTerm(key, "singular", event.target.value)
                    }
                  />
                </td>
                <td className="p-3">
                  <Input
                    value={value[key].plural}
                    onChange={(event) =>
                      studio.updateTerm(key, "plural", event.target.value)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PeopleSection({ studio }: { studio: Studio }) {
  const state = studio.state!;
  const [team, setTeam] = useState({ name: "", description: "" });
  const [user, setUser] = useState({
    email: "",
    displayName: "",
    roleKey: "member",
    teamId: "",
  });
  return (
    <div className="space-y-5">
      <Panel
        title="Role and permission model"
        description="These are the existing canonical RBAC roles. Onboarding assigns them; it does not create a parallel permission system."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {state.roles.map((role) => (
            <div key={role.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black">{role.name}</p>
                  <p className="text-xs text-slate-500">{role.key}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">
                  {role.permissions.length} permissions
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                {role.description || "System role"}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.slice(0, 8).map((permission) => (
                  <span
                    key={permission.key}
                    title={permission.description}
                    className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600"
                  >
                    {permission.key}
                  </span>
                ))}
                {role.permissions.length > 8 && (
                  <span className="px-2 py-1 text-[10px] text-slate-400">
                    +{role.permissions.length - 8}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Create team"
          description="Applies immediately to the canonical team directory and is fully audited."
        >
          <div className="space-y-3">
            <Field label="Team name">
              <Input
                value={team.name}
                onChange={(event) =>
                  setTeam({ ...team, name: event.target.value })
                }
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={team.description}
                onChange={(event) =>
                  setTeam({ ...team, description: event.target.value })
                }
              />
            </Field>
            <Button
              disabled={!team.name.trim() || studio.working === "team"}
              onClick={async () => {
                const result = await studio.createTeam(team);
                if (result) setTeam({ name: "", description: "" });
              }}
            >
              Create team
            </Button>
          </div>
        </Panel>
        <Panel
          title="Create employee account"
          description="Creates a named user. No shared administrator credentials are generated."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Display name">
              <Input
                value={user.displayName}
                onChange={(event) =>
                  setUser({ ...user, displayName: event.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={user.email}
                onChange={(event) =>
                  setUser({ ...user, email: event.target.value })
                }
              />
            </Field>
            <Field label="Initial role">
              <Select
                value={user.roleKey}
                onChange={(event) =>
                  setUser({ ...user, roleKey: event.target.value })
                }
              >
                {state.roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Team">
              <Select
                value={user.teamId}
                onChange={(event) =>
                  setUser({ ...user, teamId: event.target.value })
                }
              >
                <option value="">No team</option>
                {state.teams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            className="mt-4"
            disabled={
              !user.email || !user.displayName || studio.working === "user"
            }
            onClick={async () => {
              const result = await studio.createUser({
                email: user.email,
                displayName: user.displayName,
                roleKeys: [user.roleKey],
                teamIds: user.teamId ? [user.teamId] : [],
              });
              if (result)
                setUser({
                  email: "",
                  displayName: "",
                  roleKey: "member",
                  teamId: "",
                });
            }}
          >
            Create employee
          </Button>
        </Panel>
      </div>
      <Panel title="Current people">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-3">Employee</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Roles</th>
                <th className="pb-3">Teams</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="py-3">
                    <p className="font-bold">{item.displayName}</p>
                    <p className="text-xs text-slate-500">{item.email}</p>
                  </td>
                  <td className="py-3">{item.status}</td>
                  <td className="py-3">
                    {item.roles.map((role) => role.name).join(", ")}
                  </td>
                  <td className="py-3">
                    {item.teams?.map((team) => team.name).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function BusinessFitSection({studio,onContinue}:{studio:Studio;onContinue:()=>void}) {
  const profile=studio.state!.draft.businessProfile;
  return <div className="space-y-5">
    <Panel title="How does your business work?" description="There are no technical answers here. We use these choices to put the most relevant customer-record templates first.">
      <p className="mb-3 text-sm font-bold text-slate-700">What best describes your business?</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {([
          ["general","Another type of business","Use the answers below to recommend a broad starting point"],
          ["after-school-childcare","After-school childcare","Children, guardians, enrolments and attendance"],
          ["pet-behaviour","Pet behaviour","Pets, behaviour cases, consultations and plans"],
          ["veterinary","Veterinary practice","Animals, consultations, vaccinations and prescriptions"],
          ["pet-grooming","Pet grooming","Pets, grooming preferences, bookings and visit history"],
        ] as const).map(([value,title,description])=><Choice key={value} selected={profile.sector===value} icon={<Store/>} title={title} description={description} onClick={()=>studio.patch("businessProfile",{sector:value})}/>)}
      </div>
      <p className="mb-3 mt-6 text-sm font-bold text-slate-700">Who are your customers?</p>
      <div className="grid gap-4 md:grid-cols-3">
        {([
          ["businesses","Other businesses","Companies and the people who work in them"],
          ["consumers","Individual customers","People buying for themselves or their household"],
          ["both","Both","A meaningful mix of business and individual customers"],
        ] as const).map(([value,title,description])=><Choice key={value} selected={profile.customerType===value} icon={<Users/>} title={title} description={description} onClick={()=>studio.patch("businessProfile",{customerType:value})}/>)}
      </div>
    </Panel>
    <Panel title="Where and how do you sell?">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          ["services","Services","Advice, projects, appointments or work delivered for customers"],
          ["ecommerce","Online shop","Products ordered through a website or marketplace"],
          ["retail","Shop or premises","Products sold mainly in a physical location"],
          ["hybrid","A mixture","More than one of these is central to the business"],
        ] as const).map(([value,title,description])=><Choice key={value} selected={profile.operatingModel===value} icon={<Store/>} title={title} description={description} onClick={()=>studio.patch("businessProfile",{operatingModel:value})}/>)}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Toggle checked={profile.tracksProducts} onChange={(tracksProducts)=>studio.patch("businessProfile",{tracksProducts})} label="We need to track products" description="Put product and order-oriented templates higher in the list."/>
        <Toggle checked={profile.booksAppointments} onChange={(booksAppointments)=>studio.patch("businessProfile",{booksAppointments})} label="We book appointments or visits" description="Include appointment and service-history records in recommendations."/>
      </div>
      <Button
        className="mt-5"
        onClick={() => {
          studio.patch("businessProfile", { confirmed: true });
          onContinue();
        }}
      >
        Confirm these answers and see my templates
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </Panel>
  </div>;
}

function DataModelSection({ studio }: { studio: Studio }) {
  const state = studio.state!;
  const recommendations=rankDataModelTemplates(state.draft.businessProfile);
  const [showManual,setShowManual]=useState(false);
  const [field, setField] = useState({
    entityType: "customer",
    name: "",
    label: "",
    type: "text",
    required: false,
    options: "",
  });
  const [object, setObject] = useState({
    name: "",
    apiName: "",
    pluralName: "",
    description: "",
  });
  const [objectField, setObjectField] = useState({
    definitionId: "",
    name: "",
    label: "",
    type: "text",
    required: false,
    options: "",
  });
  const createObjectField = async () => {
    if (!objectField.definitionId) return;
    const result = await studio.createObjectField(
      objectField.definitionId,
      {
        name: objectField.name,
        label: objectField.label,
        type: objectField.type,
        required: objectField.required,
        options:
          objectField.type === "dropdown"
            ? objectField.options
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
      },
    );
    if (!result) return;
    setObjectField({
      definitionId: "",
      name: "",
      label: "",
      type: "text",
      required: false,
      options: "",
    });
  };
  const crm = state.draft.crm;
  return (
    <div className="space-y-5">
      <Panel title="Choose your starting point" description="These are ordered from the answers you just gave. A template is only a starting copy: you can rename, add and remove anything after applying it.">
        <div className="grid gap-4 lg:grid-cols-2">
          {recommendations.map((template,index)=><button type="button" key={template.key} onClick={()=>studio.patch("dataModel",{mode:"template",templateKey:template.key})} className={`rounded-2xl border-2 p-5 text-left ${state.draft.dataModel.mode==="template"&&state.draft.dataModel.templateKey===template.key?"border-blue-600 bg-blue-50":"border-slate-200 hover:border-slate-400"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-black">{template.name}</p><p className="mt-1 text-sm text-slate-600">{template.summary}</p></div>{index===0&&<span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">Best match</span>}</div>
            <p className="mt-3 text-xs font-bold text-slate-500">Best for: {template.bestFor}</p>
            <p className="mt-2 text-xs text-slate-500">{template.customerFields.length} extra customer fields · {template.objects.length} related record types</p>
          </button>)}
          <button type="button" onClick={()=>studio.patch("dataModel",{mode:"blank",templateKey:"simple-crm",appliedTemplateKey:""})} className={`rounded-2xl border-2 p-5 text-left ${state.draft.dataModel.mode==="blank"?"border-blue-600 bg-blue-50":"border-slate-200 hover:border-slate-400"}`}>
            <p className="font-black">Build my own</p><p className="mt-1 text-sm text-slate-600">Start with the standard customer, contact, activity and task records, then add only what you need.</p>
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {state.draft.dataModel.mode==="template"&&<Button disabled={studio.working==="data-model-template"} onClick={()=>void studio.applyDataModelTemplate(recommendations.find((item)=>item.key===state.draft.dataModel.templateKey)??recommendations[0])}>{studio.working==="data-model-template"?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Sparkles className="mr-2 h-4 w-4"/>}Use this template</Button>}
          <Button variant="outline" onClick={()=>setShowManual((value)=>!value)}>{showManual?"Hide detailed editor":"Customise fields and records"}</Button>
        </div>
        {state.draft.dataModel.appliedTemplateKey&&<p className="mt-3 text-xs font-bold text-emerald-700">Template added. The items below now belong to this CRM and can be changed independently.</p>}
      </Panel>
      {!showManual&&<Panel title="What will be added" description="Templates add ordinary customer fields and related record types. Every related record remains connected to its customer, so the full history stays together."><p className="text-sm text-slate-600">Open “Customise fields and records” to review or change individual items. You can also do this later from CRM settings.</p></Panel>}
      {showManual&&<>
      <Panel title="CRM operating model">
        <div className="grid gap-4 md:grid-cols-2">
          <ListField
            label="Organisation statuses"
            value={crm.organisationStatuses}
            onChange={(organisationStatuses) =>
              studio.patch("crm", { organisationStatuses })
            }
          />
          <ListField
            label="Engagement stages"
            value={crm.engagementStages}
            onChange={(engagementStages) =>
              studio.patch("crm", { engagementStages })
            }
          />
          <ListField
            label="Activity types"
            value={crm.activityTypes}
            onChange={(activityTypes) => studio.patch("crm", { activityTypes })}
          />
          <ListField
            label="Task priorities"
            value={crm.taskPriorities}
            onChange={(taskPriorities) =>
              studio.patch("crm", { taskPriorities })
            }
          />
          <Field label="Working day begins">
            <Input
              type="time"
              value={crm.workingHoursStart}
              onChange={(event) =>
                studio.patch("crm", { workingHoursStart: event.target.value })
              }
            />
          </Field>
          <Field label="Working day ends">
            <Input
              type="time"
              value={crm.workingHoursEnd}
              onChange={(event) =>
                studio.patch("crm", { workingHoursEnd: event.target.value })
              }
            />
          </Field>
        </div>
      </Panel>
      <Panel
        title="Custom fields"
        description="Creates fields in the existing canonical custom-field registry. These changes apply immediately and are audited."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Entity">
            <Select
              value={field.entityType}
              onChange={(event) =>
                setField({ ...field, entityType: event.target.value })
              }
            >
              <option value="customer">Customer</option>
              <option value="booking">Booking</option>
              <option value="service">Service</option>
              <option value="invoice">Invoice</option>
            </Select>
          </Field>
          <Field label="API name">
            <Input
              value={field.name}
              onChange={(event) =>
                setField({
                  ...field,
                  name: event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, ""),
                })
              }
            />
          </Field>
          <Field label="Label">
            <Input
              value={field.label}
              onChange={(event) =>
                setField({ ...field, label: event.target.value })
              }
            />
          </Field>
          <Field label="Type">
            <Select
              value={field.type}
              onChange={(event) =>
                setField({ ...field, type: event.target.value })
              }
            >
              {[
                "text",
                "textarea",
                "number",
                "date",
                "dropdown",
                "checkbox",
                "url",
                "email",
                "phone",
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </Select>
          </Field>
          {field.type === "dropdown" && (
            <Field label="Options" hint="Comma separated">
              <Input
                value={field.options}
                onChange={(event) =>
                  setField({ ...field, options: event.target.value })
                }
              />
            </Field>
          )}
          <Toggle
            checked={field.required}
            onChange={(required) => setField({ ...field, required })}
            label="Required field"
            description="New and edited records must supply this value."
          />
        </div>
        <Button
          className="mt-4"
          disabled={!field.name || !field.label || studio.working === "field"}
          onClick={async () => {
            const result = await studio.createField({
              ...field,
              options:
                field.type === "dropdown"
                  ? field.options
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  : [],
            });
            if (result)
              setField({
                entityType: "customer",
                name: "",
                label: "",
                type: "text",
                required: false,
                options: "",
              });
          }}
        >
          Create field
        </Button>
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {state.fields.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2"><Input defaultValue={item.label} aria-label={`Rename ${item.label}`} onBlur={(event)=>{if(event.target.value.trim()&&event.target.value.trim()!==item.label)void studio.renameField(item.id,event.target.value.trim());}}/><Button size="sm" variant="outline" aria-label={`Remove ${item.label}`} onClick={()=>void studio.deleteField(item.id)}><Trash2 className="h-4 w-4"/></Button></div>
              <p className="text-xs text-slate-500">
                {item.entityType}.{item.name} · {item.type}
                {item.required ? " · required" : ""}
              </p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Custom entities"
        description="Custom entities use the existing extension-compatible entity registry rather than a parallel onboarding data model."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Entity name">
            <Input
              value={object.name}
              onChange={(event) =>
                setObject({ ...object, name: event.target.value })
              }
            />
          </Field>
          <Field label="Plural name">
            <Input
              value={object.pluralName}
              onChange={(event) =>
                setObject({ ...object, pluralName: event.target.value })
              }
            />
          </Field>
          <Field label="API name">
            <Input
              value={object.apiName}
              onChange={(event) =>
                setObject({
                  ...object,
                  apiName: event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, ""),
                })
              }
            />
          </Field>
          <Field label="Description">
            <Input
              value={object.description}
              onChange={(event) =>
                setObject({ ...object, description: event.target.value })
              }
            />
          </Field>
        </div>
        <Button
          className="mt-4"
          disabled={
            !object.name ||
            !object.pluralName ||
            !object.apiName ||
            studio.working === "object"
          }
          onClick={async () => {
            const result = await studio.createObject(object);
            if (result)
              setObject({
                name: "",
                apiName: "",
                pluralName: "",
                description: "",
              });
          }}
        >
          Create entity
        </Button>
        <div className="my-6 border-t" />
        <h4 className="font-black">Add field to a custom entity</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Entity">
            <Select
              value={objectField.definitionId}
              onChange={(event) =>
                setObjectField({
                  ...objectField,
                  definitionId: event.target.value,
                })
              }
            >
              <option value="">Select entity</option>
              {state.objects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="API name">
            <Input
              value={objectField.name}
              onChange={(event) =>
                setObjectField({
                  ...objectField,
                  name: event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, ""),
                })
              }
            />
          </Field>
          <Field label="Label">
            <Input
              value={objectField.label}
              onChange={(event) =>
                setObjectField({ ...objectField, label: event.target.value })
              }
            />
          </Field>
          <Field label="Type">
            <Select
              value={objectField.type}
              onChange={(event) =>
                setObjectField({ ...objectField, type: event.target.value })
              }
            >
              {[
                "text",
                "textarea",
                "number",
                "date",
                "dropdown",
                "checkbox",
                "url",
                "email",
                "phone",
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </Select>
          </Field>
          {objectField.type === "dropdown" && (
            <Field label="Options">
              <Input
                value={objectField.options}
                onChange={(event) =>
                  setObjectField({
                    ...objectField,
                    options: event.target.value,
                  })
                }
              />
            </Field>
          )}
          <Toggle
            checked={objectField.required}
            onChange={(required) =>
              setObjectField({ ...objectField, required })
            }
            label="Required"
            description="Require this value on the custom record."
          />
        </div>
        <Button
          className="mt-4"
          disabled={
            !objectField.definitionId || !objectField.name || !objectField.label
          }
          onClick={() => void createObjectField()}
        >
          Add entity field
        </Button>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {state.objects.map((item) => (
            <div key={item.id} className="rounded-xl border p-4">
              <div className="flex items-center gap-2"><Input defaultValue={item.name} aria-label={`Rename ${item.name}`} onBlur={(event)=>{const name=event.target.value.trim();if(name&&name!==item.name)void studio.renameObject(item.id,{name,pluralName:item.pluralName,description:item.description??""});}}/><Button size="sm" variant="outline" aria-label={`Remove ${item.name}`} onClick={()=>void studio.deleteObject(item.id)}><Trash2 className="h-4 w-4"/></Button></div>
              <p className="text-xs text-slate-500">
                {item.apiName} · {(item.fields ?? []).length} fields
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(item.fields ?? []).map((definition) => (
                  <span
                    key={definition.id}
                    className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold"
                  >
                    {definition.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      </>}
    </div>
  );
}

function ImportSection({ studio }: { studio: Studio }) {
  const current = studio.importWorkspace;
  const preview = current.preview;
  const mappingKeys: Array<{
    key: keyof OnboardingImportMapping;
    label: string;
  }> = [
    { key: "organisationName", label: "Organisation name" },
    { key: "organisationLegalName", label: "Legal name" },
    { key: "organisationWebsite", label: "Website" },
    { key: "organisationIndustry", label: "Industry" },
    { key: "organisationCountry", label: "Country" },
    { key: "organisationStatus", label: "Status" },
    { key: "contactFirstName", label: "Contact first name" },
    { key: "contactLastName", label: "Contact last name" },
    { key: "contactEmail", label: "Contact email" },
    { key: "contactPhone", label: "Contact phone" },
    { key: "contactJobTitle", label: "Job title" },
    { key: "contactIsPrimary", label: "Primary contact" },
  ];
  return (
    <div className="space-y-5">
      <Panel
        title="Guided organisation and contact import"
        description="The file is mapped and validated before any mutation. Commit reruns the preview checksum and applies the complete import in one SQLite transaction."
      >
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <Field label="CSV file" hint="Maximum 5 MB and 10,000 data rows.">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                void studio.loadImportFile(event.target.files?.[0] as File)
              }
              className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-950 file:px-4 file:py-2.5 file:font-bold file:text-white"
            />
          </Field>
          <Field label="Duplicate strategy">
            <Select
              value={current.duplicateStrategy}
              onChange={(event) =>
                studio.setImportWorkspace({
                  ...current,
                  duplicateStrategy: event.target.value as "skip" | "reject",
                  preview: null,
                })
              }
            >
              <option value="skip">Skip and report</option>
              <option value="reject">Reject entire import</option>
            </Select>
          </Field>
        </div>
        {current.fileName && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">
              {current.fileName}
            </span>
            <Button
              onClick={() => void studio.previewImport()}
              disabled={studio.working === "import-preview"}
            >
              {studio.working === "import-preview" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              {preview ? "Re-preview" : "Preview and map"}
            </Button>
          </div>
        )}
      </Panel>
      {preview && (
        <>
          <Panel
            title="Column mapping"
            description="Review the detected mapping. Re-preview after any change so the commit checksum reflects the approved mapping."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {mappingKeys.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <Select
                    value={String(current.mapping[key] ?? "")}
                    onChange={(event) =>
                      studio.setImportWorkspace({
                        ...current,
                        mapping: {
                          ...current.mapping,
                          [key]: event.target.value || null,
                        },
                        preview: null,
                      })
                    }
                  >
                    <option value="">Not mapped</option>
                    {preview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            {!current.preview && (
              <Button
                className="mt-4"
                onClick={() => void studio.previewImport(current.mapping)}
              >
                Apply mapping and re-preview
              </Button>
            )}
          </Panel>
          <Panel title="Import impact">
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Rows" value={preview.rowCount} />
              <Metric label="Valid" value={preview.validRows} />
              <Metric label="Invalid" value={preview.invalidRows} />
              <Metric
                label="Organisations"
                value={preview.organisationsToCreate}
              />
              <Metric label="Contacts" value={preview.contactsToCreate} />
              <Metric label="Duplicates" value={preview.duplicatesToSkip} />
            </div>
            {preview.issues.length > 0 && (
              <div className="mt-5 max-h-72 overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="p-3">Row</th>
                      <th className="p-3">Field</th>
                      <th className="p-3">Severity</th>
                      <th className="p-3">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((issue, index) => (
                      <tr
                        key={`${issue.row}-${issue.field}-${index}`}
                        className="border-t"
                      >
                        <td className="p-3">{issue.row}</td>
                        <td className="p-3 font-mono text-xs">{issue.field}</td>
                        <td
                          className={`p-3 font-bold ${issue.severity === "error" ? "text-red-700" : "text-amber-700"}`}
                        >
                          {issue.severity}
                        </td>
                        <td className="p-3">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button
              className="mt-5"
              disabled={
                preview.invalidRows > 0 || studio.working === "import-commit"
              }
              onClick={() => void studio.commitImport()}
            >
              {studio.working === "import-commit" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Commit transactional import
            </Button>
          </Panel>
        </>
      )}
      <Panel title="Import history">
        <div className="space-y-2">
          {studio.state!.imports.length ? (
            studio.state!.imports.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 rounded-xl border p-3 text-sm md:grid-cols-[1fr_repeat(4,auto)] md:items-center"
              >
                <div>
                  <p className="font-black">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.rowCount} rows · {item.duplicateStrategy}
                  </p>
                </div>
                <span>{item.organisationsCreated} organisations</span>
                <span>{item.contactsCreated} contacts</span>
                <span>{item.duplicatesSkipped} skipped</span>
                <span className="font-bold text-emerald-700">
                  {item.status}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No onboarding import has been committed.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function IntegrationsSection({ studio }: { studio: Studio }) {
  const state = studio.state!;
  const communication = state.draft.communications;
  const finance = state.draft.financial;
  return (
    <div className="space-y-5">
      <Panel
        title="Communication capabilities"
        description="Communication integrations are optional during initial provisioning. Account installation and credential setup become available after the instance is published."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            checked={communication.emailEnabled}
            onChange={(emailEnabled) =>
              studio.patch("communications", {
                emailEnabled,
                connectionTested: false,
              })
            }
            label="Connected email"
            description="Enable standards-based email synchronisation and explicit outbound actions."
          />
          <Toggle
            checked={communication.calendarEnabled}
            onChange={(calendarEnabled) =>
              studio.patch("communications", {
                calendarEnabled,
                connectionTested: false,
              })
            }
            label="Connected calendar"
            description="Enable standards-based calendar synchronisation."
          />
          <Toggle
            checked={communication.connectionTested}
            onChange={(connectionTested) =>
              studio.patch("communications", { connectionTested })
            }
            label="Connection tests approved"
            description="Confirm that enabled accounts completed real test operations."
          />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Sender name">
            <Input
              value={communication.senderName}
              onChange={(event) =>
                studio.patch("communications", {
                  senderName: event.target.value,
                })
              }
            />
          </Field>
          <Field label="Reply-to email">
            <Input
              type="email"
              value={communication.replyToEmail}
              onChange={(event) =>
                studio.patch("communications", {
                  replyToEmail: event.target.value,
                })
              }
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Default signature">
              <Textarea
                value={communication.defaultSignature}
                onChange={(event) =>
                  studio.patch("communications", {
                    defaultSignature: event.target.value,
                  })
                }
              />
            </Field>
          </div>
        </div>
      </Panel>
      <Panel title="Connected accounts">
        <div className="grid gap-3 md:grid-cols-2">
          {state.accounts.length ? (
            state.accounts.map((account) => (
              <div key={account.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black">{account.name}</p>
                    <p className="text-xs text-slate-500">
                      {account.kind} · {account.username}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${account.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                  >
                    {account.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-slate-500">
                  {account.serverUrl}
                </p>
                <Button
                  variant="outline"
                  className="mt-3"
                  disabled={studio.working === `account:${account.id}`}
                  onClick={() => void studio.testAccount(account.id)}
                >
                  Test connection
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">
              No communication account is configured. Leave email and calendar
              disabled to publish the core CRM, then add encrypted provider
              credentials from Connected accounts after publication.
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Documents and financial defaults">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default tax rate">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={finance.defaultTaxRate}
              onChange={(event) =>
                studio.patch("financial", {
                  defaultTaxRate: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Invoice prefix">
            <Input
              value={finance.invoicePrefix}
              onChange={(event) =>
                studio.patch("financial", {
                  invoicePrefix: event.target.value.toUpperCase(),
                })
              }
            />
          </Field>
          <Field label="Payment terms">
            <Input
              type="number"
              min={0}
              max={365}
              value={finance.paymentTermsDays}
              onChange={(event) =>
                studio.patch("financial", {
                  paymentTermsDays: Number(event.target.value),
                })
              }
            />
          </Field>
          <Toggle
            checked={finance.creditNotesEnabled}
            onChange={(creditNotesEnabled) =>
              studio.patch("financial", { creditNotesEnabled })
            }
            label="Credit notes enabled"
            description="Enable only after the implemented financial lifecycle has been reviewed for this business."
          />
          <div className="md:col-span-2">
            <Field label="Invoice footer">
              <Textarea
                value={finance.invoiceFooter}
                onChange={(event) =>
                  studio.patch("financial", {
                    invoiceFooter: event.target.value,
                  })
                }
              />
            </Field>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ExtensionsSection({ studio }: { studio: Studio }) {
  const state = studio.state!;
  return (
    <div className="space-y-5">
      <Panel
        title="Approved extension set"
        description="Extensions are optional. During provisioning you may select only packages that are already installed and enabled; package installation becomes available after the initial instance is published."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {state.extensions.map((extension) => {
            const selected =
              studio.selectedExtensions.get(extension.packageKey)?.enabled ??
              false;
            return (
              <label
                key={extension.id}
                className={`rounded-2xl border-2 p-4 transition ${selected ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={extension.status !== "enabled"}
                    onChange={(event) =>
                      studio.toggleExtension(extension, event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{extension.name}</p>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold">
                        v{extension.currentVersion}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold">
                        {extension.signatureStatus}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {extension.description || extension.packageKey}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {extension.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="rounded bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {!state.extensions.length && (
          <p className="text-sm text-slate-500">
            No extension packages are installed. No action is required: publish
            the core CRM first, then install packages from Extensions.
          </p>
        )}
      </Panel>
      <Panel title="Selection summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Installed" value={state.extensions.length} />
          <Metric
            label="Enabled"
            value={
              state.extensions.filter((item) => item.status === "enabled")
                .length
            }
          />
          <Metric
            label="Selected for instance"
            value={state.draft.extensions.filter((item) => item.enabled).length}
          />
        </div>
      </Panel>
    </div>
  );
}

function RecoverySection({ studio }: { studio: Studio }) {
  const value = studio.state!.draft.security;
  return (
    <div className="space-y-5">
      <Panel
        title="Sign-in safety"
        description="These defaults suit most small businesses. You can change them later."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sign employees out after (hours)" hint="12 hours normally covers a working day without leaving accounts signed in indefinitely.">
            <Input
              type="number"
              min={1}
              max={720}
              value={value.sessionHours}
              onChange={(event) =>
                studio.patch("security", {
                  sessionHours: Number(event.target.value),
                })
              }
            />
          </Field>
          <Toggle
            checked={value.requireHttps}
            onChange={(requireHttps) =>
              studio.patch("security", { requireHttps })
            }
            label="Require HTTPS"
            description="Mandatory for normal managed deployments."
          />
        </div>
      </Panel>
      <Panel
        title="Could you recover the CRM if this computer failed?"
        description="For a shared CRM, the first three confirmations are needed before setup can finish. Do not tick them unless they are genuinely true. If somebody else is hosting the system, ask them to confirm these arrangements."
      >
        <div className="grid gap-3">
          <Toggle
            checked={value.backupConfigured}
            onChange={(backupConfigured) =>
              studio.patch("security", { backupConfigured })
            }
            label="Backup destination configured"
            description="Backups are copied somewhere other than the computer running the CRM."
          />
          <Toggle
            checked={value.backupEncryptionConfirmed}
            onChange={(backupEncryptionConfirmed) =>
              studio.patch("security", { backupEncryptionConfirmed })
            }
            label="Backup encryption confirmed"
            description="Backup files are protected, and the recovery password is stored somewhere safe."
          />
          <Toggle
            checked={value.recoveryPlanConfirmed}
            onChange={(recoveryPlanConfirmed) =>
              studio.patch("security", { recoveryPlanConfirmed })
            }
            label="Recovery plan confirmed"
            description="You know who is responsible for restoring the CRM and how to contact them."
          />
          <Toggle
            checked={value.restoreRehearsed}
            onChange={(restoreRehearsed) =>
              studio.patch("security", { restoreRehearsed })
            }
            label="Restore rehearsal completed"
            description="Recommended after setup: a backup has been tested without risking the live CRM."
          />
          <Toggle
            checked={value.retentionPolicyReviewed}
            onChange={(retentionPolicyReviewed) =>
              studio.patch("security", { retentionPolicyReviewed })
            }
            label="Retention policy reviewed"
            description="Recommended: you have decided how long customer and audit records should be kept."
          />
        </div>
        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          The actual backup schedule and storage settings become available once
          setup is finished. These questions make sure a workable plan exists
          before a shared CRM starts holding customer data.
        </div>
      </Panel>
    </div>
  );
}

function EmployeesSection({ studio }: { studio: Studio }) {
  const state = studio.state!;
  const value = state.draft.employees;
  const [userId, setUserId] = useState(
    state.users.find(
      (user) =>
        user.status === "active" &&
        !user.roles.some((role) => role.key === "owner"),
    )?.id ?? "",
  );
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [token, setToken] = useState("");
  const issue = async () => {
    const result = await studio.createEnrolment(userId, deviceLimit);
    if (result && typeof result === "object" && "enrolmentToken" in result)
      setToken(String((result as { enrolmentToken: string }).enrolmentToken));
    await studio.reload();
  };
  return (
    <div className="space-y-5">
      <Panel title="Employee client policy">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default role">
            <Select
              value={value.defaultRoleKey}
              onChange={(event) =>
                studio.patch("employees", {
                  defaultRoleKey: event.target.value,
                })
              }
            >
              {state.roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Enrolment validity (hours)">
            <Input
              type="number"
              min={1}
              max={168}
              value={value.enrolmentTtlHours}
              onChange={(event) =>
                studio.patch("employees", {
                  enrolmentTtlHours: Number(event.target.value),
                })
              }
            />
          </Field>
          <Toggle
            checked={value.requireOneTimeEnrolment}
            onChange={(requireOneTimeEnrolment) =>
              studio.patch("employees", { requireOneTimeEnrolment })
            }
            label="Require one-time enrolment"
            description="Each employee activates using a short-lived user-bound token."
          />
          <Toggle
            checked={value.deviceRegistrationRequired}
            onChange={(deviceRegistrationRequired) =>
              studio.patch("employees", { deviceRegistrationRequired })
            }
            label="Register employee devices"
            description="Bind activation to an auditable device record."
          />
        </div>
      </Panel>
      <Panel
        title="Issue one-time enrolment"
        description="The raw token is shown once. Only its hash and non-secret prefix are retained."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <Field label="Employee">
            <Select
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              <option value="">Select employee</option>
              {state.users
                .filter((user) => user.status === "active")
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} · {user.email}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Device limit">
            <Input
              type="number"
              min={1}
              max={20}
              value={deviceLimit}
              onChange={(event) => setDeviceLimit(Number(event.target.value))}
            />
          </Field>
          <div className="self-end">
            <Button
              disabled={!userId || studio.working === "enrolment"}
              onClick={() => void issue()}
            >
              Create token
            </Button>
          </div>
        </div>
        {token && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-amber-900">
              Shown once
            </p>
            <code className="mt-2 block break-all rounded bg-white p-3 text-xs">
              {token}
            </code>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void navigator.clipboard.writeText(token)}
            >
              Copy token
            </Button>
          </div>
        )}
      </Panel>
      <Panel title="Issued enrolments">
        <div className="space-y-2">
          {state.enrolments.length ? (
            state.enrolments.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{item.userName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.codePrefix} · {item.redeemedCount}/{item.deviceLimit}{" "}
                    redeemed · expires{" "}
                    {new Date(item.expiresAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={
                    Boolean(item.revokedAt) ||
                    studio.working === `enrolment:${item.id}`
                  }
                  onClick={() => void studio.revokeEnrolment(item.id)}
                >
                  {item.revokedAt ? "Revoked" : "Revoke"}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No enrolment has been issued.
            </p>
          )}
        </div>
      </Panel>
      <Panel title="Registered devices">
        <div className="space-y-2">
          {state.devices.length ? (
            state.devices.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{item.deviceName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.userName} · registered{" "}
                    {new Date(item.registeredAt).toLocaleString()} · last seen{" "}
                    {new Date(item.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={
                    Boolean(item.revokedAt) ||
                    studio.working === `device:${item.id}`
                  }
                  onClick={() => void studio.revokeDevice(item.id)}
                >
                  {item.revokedAt ? "Revoked" : "Revoke device"}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No employee device has been registered.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function PublishSection({
  studio,
  onSelect,
}: {
  studio: Studio;
  onSelect: (section: ProvisioningSection) => void;
}) {
  const state = studio.state!;
  const [approved, setApproved] = useState(false);
  return (
    <div className="space-y-5">
      <PublicationChecklist
        checks={state.workspace.readiness.checks}
        onSelect={onSelect}
      />
      <Panel
        title="What you are setting up"
        description="This is the information your employees will see when they open the CRM."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Metric
            label="Business"
            value={state.draft.identity.displayName || "Not configured"}
          />
          <Metric
            label="Access"
            value={
              state.draft.deployment.mode === "managed"
                ? "Managed shared instance"
                : "Standalone local instance"
            }
          />
          <Metric
            label="Setup status"
            value={state.workspace.readiness.publishable ? "Ready" : "Needs attention"}
          />
          <Metric label="Employees" value={state.users.length} />
          <Metric
            label="Selected extensions"
            value={state.draft.extensions.filter((item) => item.enabled).length}
          />
        </div>
      </Panel>
      <Panel
        title="Finish setup and open the CRM"
        description="We will make a safety backup, protect this approved setup from accidental changes and then open the CRM workspace. Your live customer database and passwords are never included in the setup profile."
      >
        <label className="flex items-start gap-3 rounded-xl border p-4">
          <input
            type="checkbox"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
            className="mt-1 h-4 w-4 accent-blue-600"
          />
          <span>
            <span className="block text-sm font-black">
              I have checked these business details and want to finish setup
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              You can change normal business settings later. Finishing setup
              opens the CRM for day-to-day use.
            </span>
          </span>
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            disabled={
              !approved ||
              !state.workspace.readiness.publishable ||
              studio.working === "publish"
            }
            onClick={() => void studio.publish()}
          >
            {studio.working === "publish" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Finish setup
          </Button>
          {state.profile && (
            <Button variant="outline" onClick={studio.downloadDeploymentFiles}>
              <Download className="mr-2 h-4 w-4" />
              Download installation profile
            </Button>
          )}
        </div>
      </Panel>
      <Panel
        title="Previous setup versions"
        description="Advanced recovery history. Restoring a version creates a new auditable version; it never erases the history."
      >
        <div className="space-y-2">
          {state.workspace.history.map((revision) => (
            <div
              key={revision.id}
              className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-black">
                  Revision {revision.revision} · {revision.state}
                </p>
                <p className="text-xs text-slate-500">
                  Updated {new Date(revision.updatedAt).toLocaleString()}
                  {revision.publishedAt
                    ? ` · published ${new Date(revision.publishedAt).toLocaleString()}`
                    : ""}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                  {revision.checksum}
                </p>
              </div>
              {revision.state !== "draft" && (
                <Button
                  variant="outline"
                  disabled={studio.working === "rollback"}
                  onClick={() => void studio.rollback(revision.id)}
                >
                  Restore as new publication
                </Button>
              )}
            </div>
          ))}
        </div>
      </Panel>
      {state.profile && (
        <Panel title="Current deployment identity">
          <div className="grid gap-4 md:grid-cols-2">
            <Summary
              label="Instance ID"
              value={state.profile.profile.instanceId}
            />
            <Summary
              label="Configuration revision"
              value={String(state.profile.profile.configurationRevision)}
            />
            <Summary
              label="Approved origin"
              value={
                state.profile.profile.instanceUrl ||
                "Standalone embedded backend"
              }
            />
            <Summary
              label="Minimum client"
              value={state.profile.profile.minimumClientVersion}
            />
            <Summary label="Profile checksum" value={state.profile.checksum} />
            <Summary
              label="Published"
              value={new Date(
                state.profile.profile.publishedAt,
              ).toLocaleString()}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-bold">{value}</p>
    </div>
  );
}

function LivePreview({ value }: { value: OnboardingConfiguration }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        Live employee preview
      </p>
      <div
        className="mt-3 overflow-hidden rounded-2xl border shadow-lg"
        style={{ background: value.branding.backgroundColor }}
      >
        <div
          className="flex items-center gap-3 p-4 text-white"
          style={{ background: value.branding.primaryColor }}
        >
          {value.branding.logoUrl ? (
            <img
              src={value.branding.logoUrl}
              alt=""
              className="h-9 w-9 rounded bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 font-black">
              {value.identity.displayName?.[0] || "W"}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-black">
              {value.identity.displayName || "Your business"}
            </p>
            <p className="text-[10px] opacity-70">
              {value.deployment.mode === "managed"
                ? "Managed CRM workspace"
                : "Standalone CRM workspace"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[92px_1fr] gap-3 p-3">
          <div className="space-y-2">
            {[
              "Dashboard",
              value.terminology.organisation.plural,
              value.terminology.contact.plural,
              value.terminology.task.plural,
            ].map((item, index) => (
              <div
                key={item}
                className={`truncate rounded px-2 py-2 text-[9px] font-bold ${index === 0 ? "text-white" : "bg-white/80 text-slate-600"}`}
                style={
                  index === 0
                    ? { background: value.branding.secondaryColor }
                    : {}
                }
              >
                {item}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <p className="text-[9px] font-bold uppercase text-slate-400">
                Today
              </p>
              <p className="mt-1 text-lg font-black text-slate-900">
                Everything in order
              </p>
              <div
                className="mt-3 h-2 rounded-full"
                style={{ background: value.branding.accentColor }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 rounded-xl bg-white shadow-sm" />
              <div className="h-16 rounded-xl bg-white shadow-sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function ModuleEvidence({ studio }: { studio: Studio }) {
  const state = studio.state!;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-black">Provisioning evidence</h3>
      <div className="mt-3 space-y-2 text-xs">
        <Evidence label="Named employees" value={state.users.length} />
        <Evidence label="Teams" value={state.teams.length} />
        <Evidence
          label="Custom schema items"
          value={state.fields.length + state.objects.length}
        />
        <Evidence
          label="Completed imports"
          value={
            state.imports.filter((item) => item.status === "completed").length
          }
        />
        <Evidence
          label="Connected accounts"
          value={state.accounts.filter((item) => item.enabled).length}
        />
        <Evidence
          label="Registered devices"
          value={state.devices.filter((item) => !item.revokedAt).length}
        />
      </div>
    </div>
  );
}
function Evidence({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}

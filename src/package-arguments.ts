/**
 * Build argv segments for stdio package installs from registry `packageArguments`
 * (official MCP server.json / registry schema).
 *
 * Named arguments emit `[flag, value]` (two argv cells). Positional arguments emit
 * one cell each. Order matches the registry array order.
 */
import {
  findTemplateVars,
  resolveTemplates,
  substituteTemplatePlaceholders,
} from "./template.js";

const ARG_PLACEHOLDER = "<your-variable-value-here>";

export interface RegistryPackageArgumentDefinition {
  type?: "" | "positional" | "named";
  name?: string;
  value?: string;
  valueHint?: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  isRepeated?: boolean;
  default?: string;
  format?: string;
}

export function normalizeNamedFlag(name: string): string {
  const t = name.trim();
  if (t.startsWith("-")) return t;
  return `--${t}`;
}

/** Official registry field; legacy aliases are not used by published APIs. */
export function definitionsFromPackage(pkg: {
  packageArguments?: RegistryPackageArgumentDefinition[];
}): RegistryPackageArgumentDefinition[] {
  return pkg.packageArguments ?? [];
}

export function isNamedArg(d: RegistryPackageArgumentDefinition): boolean {
  if (d.type === "positional") return false;
  if (d.type === "named") return true;
  return Boolean(d.name?.trim());
}

function labelForArg(
  d: RegistryPackageArgumentDefinition,
  index: number,
): string {
  if (isNamedArg(d)) {
    return `Flag ${normalizeNamedFlag(d.name!)}`;
  }
  return (
    d.valueHint?.trim() ||
    d.description?.trim() ||
    `Positional argument #${index + 1}`
  );
}

function hasTemplates(s: string | undefined): boolean {
  return Boolean(s && findTemplateVars(s).length > 0);
}

export type PackageArgPrompt = (info: {
  label: string;
  isRequired: boolean;
  placeholder: string;
}) => Promise<string | symbol>;

export type ResolveArgvResult =
  | { argv: string[]; cancelled: false }
  | { cancelled: true };

/**
 * Non-interactive (-y): literals and defaults where present; templates become
 * placeholders; required gaps filled with placeholder. Optional named args are
 * omitted when unset. Optional positional args use placeholder to preserve argv order.
 */
export function buildPackageArgumentsArgvNonInteractive(
  definitions: RegistryPackageArgumentDefinition[],
  placeholder: string = ARG_PLACEHOLDER,
): string[] {
  const out: string[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const d = definitions[i]!;
    if (isNamedArg(d)) {
      const flag = normalizeNamedFlag(d.name!);
      let val = d.value?.trim() ?? "";
      if (hasTemplates(d.value)) {
        val = substituteTemplatePlaceholders(d.value!, placeholder);
      } else if (!val && d.default?.trim()) {
        val = d.default.trim();
      }
      if (!val) {
        if (d.isRequired === true) {
          out.push(flag, placeholder);
        }
        continue;
      }
      out.push(flag, val);
    } else {
      // Positional
      let val = d.value?.trim() ?? "";
      if (hasTemplates(d.value)) {
        val = substituteTemplatePlaceholders(d.value!, placeholder);
        pushPositionalSegments(out, d, val);
        continue;
      }
      if (val) {
        pushPositionalSegments(out, d, val);
        continue;
      }
      if (d.default?.trim()) {
        pushPositionalSegments(out, d, d.default.trim());
        continue;
      }
      pushPositionalSegments(out, d, placeholder);
    }
  }

  return out;
}

function pushPositionalSegments(
  out: string[],
  d: RegistryPackageArgumentDefinition,
  raw: string,
): void {
  if (d.isRepeated === true) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) {
      out.push(raw);
      return;
    }
    for (const p of parts) {
      out.push(p);
    }
    return;
  }
  out.push(raw);
}

/**
 * Interactive: prompt for values and `${VAR}` templates; optional named args
 * omitted when skipped. Optional positional skips use placeholder to preserve order.
 */
export async function buildPackageArgumentsArgvInteractive(
  definitions: RegistryPackageArgumentDefinition[],
  prompt: PackageArgPrompt,
): Promise<ResolveArgvResult> {
  const out: string[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const d = definitions[i]!;
    const label = labelForArg(d, i);

    if (isNamedArg(d)) {
      const flag = normalizeNamedFlag(d.name!);
      let val = d.value ?? "";

      if (hasTemplates(d.value)) {
        const res = await resolveTemplates(d.value!, async (varName) => {
          const answer = await prompt({
            label: `${label} (${varName})`,
            isRequired: true,
            placeholder: `<${varName}>`,
          });
          return answer;
        });
        if (res.cancelled) return { cancelled: true };
        val = res.resolved;
        out.push(flag, val);
        continue;
      }

      if (val.trim()) {
        out.push(flag, val.trim());
        continue;
      }

      const defVal = d.default?.trim() ?? "";

      const raw = await prompt({
        label,
        isRequired: d.isRequired === true,
        placeholder: defVal || ARG_PLACEHOLDER,
      });
      if (typeof raw === "symbol") return { cancelled: true };
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (!trimmed) {
        if (d.isRequired === true) {
          out.push(flag, defVal || ARG_PLACEHOLDER);
        } else if (defVal) {
          out.push(flag, defVal);
        }
        continue;
      }
      out.push(flag, trimmed);
      continue;
    }

    // Positional
    let val = d.value ?? "";
    if (hasTemplates(d.value)) {
      const res = await resolveTemplates(d.value!, async (varName) => {
        const answer = await prompt({
          label: `${label} (${varName})`,
          isRequired: true,
          placeholder: `<${varName}>`,
        });
        return answer;
      });
      if (res.cancelled) return { cancelled: true };
      val = res.resolved;
      pushPositionalSegments(out, d, val);
      continue;
    }

    if (val.trim()) {
      pushPositionalSegments(out, d, val.trim());
      continue;
    }

    const defVal = d.default?.trim() ?? "";
    if (defVal) {
      pushPositionalSegments(out, d, defVal);
      continue;
    }

    if (d.isRequired !== true) {
      const raw = await prompt({
        label,
        isRequired: false,
        placeholder: ARG_PLACEHOLDER,
      });
      if (typeof raw === "symbol") return { cancelled: true };
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (!trimmed) {
        pushPositionalSegments(out, d, ARG_PLACEHOLDER);
      } else {
        pushPositionalSegments(out, d, trimmed);
      }
      continue;
    }

    const raw = await prompt({
      label,
      isRequired: true,
      placeholder: ARG_PLACEHOLDER,
    });
    if (typeof raw === "symbol") return { cancelled: true };
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    pushPositionalSegments(
      out,
      d,
      trimmed.length > 0 ? trimmed : ARG_PLACEHOLDER,
    );
  }

  return { argv: out, cancelled: false };
}

export { ARG_PLACEHOLDER };

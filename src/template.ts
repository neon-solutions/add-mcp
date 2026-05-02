const TEMPLATE_PATTERN = /\$\{([^}]+)\}/g;

export function findTemplateVars(value: string): string[] {
  const vars: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_PATTERN.exec(value)) !== null) {
    vars.push(match[1]!);
  }
  TEMPLATE_PATTERN.lastIndex = 0;
  return vars;
}

/** Replace each `${VAR}` with the same placeholder (non-interactive / -y installs). */
export function substituteTemplatePlaceholders(
  value: string,
  replacement: string,
): string {
  return value.replace(/\$\{([^}]+)\}/g, () => replacement);
}

export async function resolveTemplates(
  value: string,
  ask: (varName: string) => Promise<string | symbol>,
): Promise<{ resolved: string; cancelled: boolean }> {
  const vars = findTemplateVars(value);
  if (vars.length === 0) return { resolved: value, cancelled: false };

  let result = value;
  for (const varName of vars) {
    const answer = await ask(varName);
    if (typeof answer === "symbol") return { resolved: value, cancelled: true };
    const entered = typeof answer === "string" ? answer : "";
    result = result.replace(`\${${varName}}`, entered);
  }
  return { resolved: result, cancelled: false };
}

export async function resolveRecordTemplates(
  record: Record<string, string>,
  ask: (varName: string) => Promise<string | symbol>,
): Promise<{ resolved: Record<string, string>; cancelled: boolean }> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const result = await resolveTemplates(value, ask);
    if (result.cancelled) return { resolved: record, cancelled: true };
    resolved[key] = result.resolved;
  }
  return { resolved, cancelled: false };
}

export async function resolveArrayTemplates(
  values: string[],
  ask: (varName: string) => Promise<string | symbol>,
): Promise<{ resolved: string[]; cancelled: boolean }> {
  const resolved: string[] = [];
  for (const value of values) {
    const result = await resolveTemplates(value, ask);
    if (result.cancelled) return { resolved: values, cancelled: true };
    resolved.push(result.resolved);
  }
  return { resolved, cancelled: false };
}

export function hasTemplateVars(
  values: Record<string, string> | string[],
): boolean {
  const strings = Array.isArray(values) ? values : Object.values(values);
  return strings.some((v) => findTemplateVars(v).length > 0);
}

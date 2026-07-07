"use client";

import { useState, useMemo } from "react";
import { CheckIcon, CopyIcon, TerminalIcon, GlobeIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EnvVar = {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
};

type Package = {
  registryType: string;
  identifier: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type: string };
  environmentVariables?: EnvVar[];
};

type RemoteHeader = {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  format?: string;
  default?: string;
};

type Remote = {
  type: string;
  url: string;
  headers?: RemoteHeader[];
};

type InstallConfiguratorProps = {
  packages?: Package[];
  remotes?: Remote[];
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={handleCopy}
      aria-label="Copy command"
    >
      {copied ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Install command</Label>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <code className="flex-1 overflow-x-auto text-sm break-all font-mono">
          {command}
        </code>
        <CopyButton text={command} />
      </div>
    </div>
  );
}

function PackageConfigurator({ pkg }: { pkg: Package }) {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  function setEnvValue(name: string, value: string) {
    setEnvValues((prev) => ({ ...prev, [name]: value }));
  }

  const command = useMemo(() => {
    const parts = ["npx add-mcp@latest", pkg.identifier];

    for (const envVar of pkg.environmentVariables ?? []) {
      const value = envValues[envVar.name] || `<${envVar.name}>`;
      parts.push(`--env ${envVar.name}=${value}`);
    }

    return parts.join(" ");
  }, [pkg, envValues]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{pkg.registryType}</Badge>
        <Badge variant="secondary">{pkg.transport?.type ?? "stdio"}</Badge>
        <span className="text-sm font-mono text-muted-foreground">
          {pkg.identifier}
        </span>
      </div>

      {pkg.environmentVariables && pkg.environmentVariables.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Environment variables</Label>
          <div className="grid gap-3">
            {pkg.environmentVariables.map((envVar) => (
              <div key={envVar.name} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`env-${envVar.name}`}
                    className="font-mono text-xs"
                  >
                    {envVar.name}
                  </Label>
                  {envVar.isRequired && (
                    <Badge variant="destructive" className="text-[10px]">
                      required
                    </Badge>
                  )}
                  {envVar.isSecret && (
                    <Badge variant="secondary" className="text-[10px]">
                      secret
                    </Badge>
                  )}
                </div>
                {envVar.description && (
                  <p className="text-xs text-muted-foreground">
                    {envVar.description}
                  </p>
                )}
                <Input
                  id={`env-${envVar.name}`}
                  type={envVar.isSecret ? "password" : "text"}
                  placeholder={envVar.name}
                  value={envValues[envVar.name] ?? ""}
                  onChange={(e) => setEnvValue(envVar.name, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <CommandBlock command={command} />
    </div>
  );
}

function RemoteConfigurator({ remote }: { remote: Remote }) {
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});

  function setHeaderValue(name: string, value: string) {
    setHeaderValues((prev) => ({ ...prev, [name]: value }));
  }

  const transportFlag = useMemo(() => {
    if (remote.type === "sse") return "sse";
    return "http";
  }, [remote.type]);

  const command = useMemo(() => {
    const parts = ["npx add-mcp@latest", remote.url];

    parts.push(`--transport ${transportFlag}`);

    for (const header of remote.headers ?? []) {
      const value = headerValues[header.name] || `<${header.name}>`;
      parts.push(`--header "${header.name}: ${value}"`);
    }

    return parts.join(" ");
  }, [remote, headerValues, transportFlag]);

  const displayType =
    remote.type === "sse"
      ? "SSE"
      : remote.type === "streamable-http"
        ? "Streamable HTTP"
        : remote.type;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{displayType}</Badge>
        <span className="text-sm font-mono text-muted-foreground break-all">
          {remote.url}
        </span>
      </div>

      {remote.headers && remote.headers.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Headers</Label>
          <div className="grid gap-3">
            {remote.headers.map((header) => (
              <div key={header.name} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`header-${header.name}`}
                    className="font-mono text-xs"
                  >
                    {header.name}
                  </Label>
                  {header.isRequired && (
                    <Badge variant="destructive" className="text-[10px]">
                      required
                    </Badge>
                  )}
                  {header.isSecret && (
                    <Badge variant="secondary" className="text-[10px]">
                      secret
                    </Badge>
                  )}
                </div>
                {header.description && (
                  <p className="text-xs text-muted-foreground">
                    {header.description}
                  </p>
                )}
                <Input
                  id={`header-${header.name}`}
                  type={header.isSecret ? "password" : "text"}
                  placeholder={header.default ?? header.name}
                  value={headerValues[header.name] ?? ""}
                  onChange={(e) => setHeaderValue(header.name, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <CommandBlock command={command} />
    </div>
  );
}

type InstallMethod =
  | { kind: "package"; label: string; pkg: Package }
  | { kind: "remote"; label: string; remote: Remote };

export function InstallConfigurator({
  packages,
  remotes,
}: InstallConfiguratorProps) {
  const methods: InstallMethod[] = useMemo(() => {
    const result: InstallMethod[] = [];

    for (const pkg of packages ?? []) {
      const transport = pkg.transport?.type ?? "stdio";
      result.push({
        kind: "package",
        label: `${pkg.registryType} (${transport})`,
        pkg,
      });
    }

    for (const remote of remotes ?? []) {
      const type =
        remote.type === "sse"
          ? "SSE"
          : remote.type === "streamable-http"
            ? "HTTP"
            : remote.type;
      result.push({
        kind: "remote",
        label: `Remote (${type})`,
        remote,
      });
    }

    return result;
  }, [packages, remotes]);

  if (methods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No installation methods available for this server.
      </p>
    );
  }

  if (methods.length === 1) {
    const method = methods[0];
    return (
      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          {method.kind === "package" ? (
            <TerminalIcon className="size-4" />
          ) : (
            <GlobeIcon className="size-4" />
          )}
          {method.label}
        </div>
        {method.kind === "package" ? (
          <PackageConfigurator pkg={method.pkg} />
        ) : (
          <RemoteConfigurator remote={method.remote} />
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue="0">
      <TabsList>
        {methods.map((method, i) => (
          <TabsTrigger key={i} value={String(i)}>
            {method.kind === "package" ? (
              <TerminalIcon className="size-3.5" />
            ) : (
              <GlobeIcon className="size-3.5" />
            )}
            {method.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {methods.map((method, i) => (
        <TabsContent
          key={i}
          value={String(i)}
          className="rounded-lg border p-4"
        >
          {method.kind === "package" ? (
            <PackageConfigurator pkg={method.pkg} />
          ) : (
            <RemoteConfigurator remote={method.remote} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

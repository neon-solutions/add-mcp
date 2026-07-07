import { z } from "zod";

const serverNamePattern = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

const officialMetaSchema = z
  .object({
    status: z.enum(["active", "deprecated", "deleted"]),
    statusMessage: z.string().max(500).optional(),
    publishedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    isLatest: z.boolean().optional(),
  })
  .strict();

const responseMetaSchema = z
  .object({
    "io.modelcontextprotocol.registry/official": officialMetaSchema.optional(),
  })
  .passthrough();

const iconSchema = z
  .object({
    src: z.string().url(),
    mimeType: z
      .enum([
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/svg+xml",
        "image/webp",
      ])
      .optional(),
    sizes: z.array(z.string().regex(/^(\d+x\d+|any)$/)).optional(),
    theme: z.enum(["light", "dark"]).optional(),
  })
  .passthrough();

const serverDetailMetaSchema = z
  .object({
    "io.modelcontextprotocol.registry/publisher-provided": z
      .record(z.string(), z.unknown())
      .optional(),
  })
  .passthrough();

const repositorySchema = z
  .object({
    url: z.string().url().optional(),
    source: z.string().optional(),
    id: z.string().optional(),
    subfolder: z.string().optional(),
  })
  .passthrough();

const environmentVariableSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    isSecret: z.boolean().optional(),
  })
  .passthrough();

const transportSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const packageSchema = z
  .object({
    registryType: z.string(),
    registryBaseUrl: z.string().url().optional(),
    identifier: z.string(),
    version: z.string().optional(),
    runtimeHint: z.string().optional(),
    transport: transportSchema.optional(),
    environmentVariables: z.array(environmentVariableSchema).optional(),
  })
  .passthrough();

const remoteHeaderSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    format: z.string().optional(),
    default: z.string().optional(),
  })
  .passthrough();

const remoteSchema = z
  .object({
    type: z.string(),
    url: z.string().url(),
    headers: z.array(remoteHeaderSchema).optional(),
  })
  .passthrough();

export const serverDetailSchema = z
  .object({
    $schema: z.string().url().optional(),
    name: z.string().min(3).max(200).regex(serverNamePattern),
    description: z.string().min(1).max(500),
    title: z.string().min(1).max(200).optional(),
    repository: repositorySchema.optional(),
    version: z.string().min(1).max(255),
    websiteUrl: z.string().url().optional(),
    icons: z.array(iconSchema).optional(),
    packages: z.array(packageSchema).optional(),
    remotes: z.array(remoteSchema).optional(),
    _meta: serverDetailMetaSchema.optional(),
  })
  .passthrough();

export const serverEntrySchema = z
  .object({
    server: serverDetailSchema,
    _meta: responseMetaSchema.optional(),
  })
  .passthrough();

export const sourceRegistrySchema = z.array(serverEntrySchema);

export const listResponseSchema = z.object({
  servers: z.array(serverEntrySchema),
  metadata: z.object({
    count: z.number().int().nonnegative(),
    nextCursor: z.string().optional(),
  }),
});

export type ServerEntry = z.infer<typeof serverEntrySchema>;

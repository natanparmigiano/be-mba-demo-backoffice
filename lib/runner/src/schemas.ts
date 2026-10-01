import { z } from 'zod'

export const RUNNER_FUNCTION_CODE_MAX_LENGTH = 100_000
export const RUNNER_FUNCTION_PARAMETER_LIMIT = 100
export const RUNNER_ENTITY_NAME_MAX_LENGTH = 512

export const runnerParameterDefinitionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, 'Invalid parameter name'),
  type: z.enum(['boolean', 'integer', 'json', 'number', 'string']),
  required: z.boolean().default(true),
  description: z.string().trim().max(500).nullable().optional(),
})

export const runnerParameterListSchema = z
  .array(runnerParameterDefinitionSchema)
  .max(RUNNER_FUNCTION_PARAMETER_LIMIT)
  .superRefine((parameters, context) => {
    const names = new Set<string>()
    for (const [index, parameter] of parameters.entries()) {
      if (names.has(parameter.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate parameter: ${parameter.name}`,
          path: [index, 'name'],
        })
      }
      names.add(parameter.name)
    }
  })

export const runnerFunctionCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(RUNNER_FUNCTION_CODE_MAX_LENGTH)

export const runnerFunctionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(RUNNER_ENTITY_NAME_MAX_LENGTH)
  .regex(
    /^[a-z0-9]+(?:_{1,2}[a-z0-9]+)*$/,
    'Name must use snake_case with optional double-underscore namespaces',
  )

export const runnerMcpNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(RUNNER_ENTITY_NAME_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'Name must use snake_case')

export const createRunnerFunctionSchema = z.object({
  name: runnerFunctionNameSchema,
  description: z.string().trim().max(2_000).nullable().optional(),
  code: runnerFunctionCodeSchema,
  parameters: runnerParameterListSchema.default([]),
})

export const updateRunnerFunctionSchema = z.object({
  name: runnerFunctionNameSchema.optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  code: runnerFunctionCodeSchema,
  parameters: runnerParameterListSchema,
})

const runnerMcpFunctionIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(1_000)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Function IDs must be unique',
  })

export const createRunnerMcpSchema = z.object({
  name: runnerMcpNameSchema,
  description: z.string().trim().max(2_000).nullable().optional(),
  functionIds: runnerMcpFunctionIdsSchema,
})

export const updateRunnerMcpSchema = createRunnerMcpSchema

export const executeRunnerFunctionSchema = z.object({
  arguments: z.record(z.string(), z.unknown()).default({}),
  revision: z.number().int().positive().optional(),
})

export const createRunnerApiKeySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((name) => name.toLocaleUpperCase() !== 'UI', {
        message: 'UI is reserved for browser test execution',
      }),
    expiresAt: z.coerce.date(),
    allowedFunctionIds: z
      .array(z.number().int().positive())
      .max(1_000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Function IDs must be unique',
      })
      .nullable()
      .default(null),
    allowedMcpIds: z
      .array(z.number().int().positive())
      .max(1_000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'MCP IDs must be unique',
      })
      .nullable()
      .default(null),
  })
  .refine(({ expiresAt }) => expiresAt.getTime() > Date.now(), {
    message: 'Expiration must be in the future',
    path: ['expiresAt'],
  })

export type RunnerParameterDefinition = z.infer<
  typeof runnerParameterDefinitionSchema
>
export type CreateRunnerFunctionInput = z.infer<
  typeof createRunnerFunctionSchema
>
export type UpdateRunnerFunctionInput = z.infer<
  typeof updateRunnerFunctionSchema
>
export type CreateRunnerMcpInput = z.infer<typeof createRunnerMcpSchema>
export type UpdateRunnerMcpInput = z.infer<typeof updateRunnerMcpSchema>
export type ExecuteRunnerFunctionInput = z.infer<
  typeof executeRunnerFunctionSchema
>
export type CreateRunnerApiKeyInput = z.infer<typeof createRunnerApiKeySchema>

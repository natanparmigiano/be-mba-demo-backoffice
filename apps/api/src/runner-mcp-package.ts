import {
  RUNNER_MCP_PACKAGE_MAX_BYTES,
  runnerMcpPackageSchema,
  type RunnerMcpPackage,
} from '@mba-demo/runner'
import { ZodError } from 'zod'
import { parseYaml, stringifyYaml } from './yaml.js'

const encoder = new TextEncoder()

export function parseRunnerMcpPackageYaml(value: string): RunnerMcpPackage {
  const byteLength = encoder.encode(value).byteLength
  if (byteLength === 0 || byteLength > RUNNER_MCP_PACKAGE_MAX_BYTES) {
    throw new TypeError('MCP package has an invalid size')
  }
  try {
    return runnerMcpPackageSchema.parse(parseYaml(value))
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TypeError(
        `Invalid MCP package: ${error.issues[0]?.message ?? 'schema mismatch'}`,
        { cause: error },
      )
    }
    throw error
  }
}

export function stringifyRunnerMcpPackageYaml(value: RunnerMcpPackage): string {
  const yaml = stringifyYaml(runnerMcpPackageSchema.parse(value))
  if (encoder.encode(yaml).byteLength > RUNNER_MCP_PACKAGE_MAX_BYTES) {
    throw new TypeError('MCP package exceeds the export size limit')
  }
  return yaml
}

import {
  db,
  organization,
  runnerExecutionLogs,
  runnerFunctionApiKeys,
  runnerFunctionRevisions,
  runnerFunctions,
  runnerMcpFunctions,
  runnerMcps,
  runnerRevisionParameters,
} from '@mba-demo/db'
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import {
  getRunnerMcpImportTargetName,
  isRunnerMcpImportTargetNameValid,
  type RunnerMcpImportBlocker,
  type RunnerMcpImportPreview,
  type RunnerMcpPackage,
} from './mcp-package.js'
import type {
  CreateRunnerApiKeyInput,
  CreateRunnerFunctionInput,
  CreateRunnerMcpInput,
  RunnerParameterDefinition,
  UpdateRunnerFunctionInput,
  UpdateRunnerMcpInput,
} from './schemas.js'
import type {
  RunnerArchiveResult,
  RunnerApiKeyMetadata,
  RunnerCreateApiKeyResult,
  RunnerClaimedExecution,
  RunnerDeleteFunctionResult,
  RunnerExecutionLogOutcome,
  RunnerExecutionHistoryEntry,
  RunnerExecutionResultState,
  RunnerExecutionRevision,
  RunnerFunctionDefinition,
  RunnerFunctionRevision,
  RunnerFunctionSummary,
  RunnerGetResult,
  RunnerGetMcpResult,
  RunnerGetMcpRuntimeResult,
  RunnerCreateMcpResult,
  RunnerListApiKeysResult,
  RunnerListExecutionsResult,
  RunnerListMcpsResult,
  RunnerMcpDefinition,
  RunnerMcpImportResult,
  RunnerMcpMutationResult,
  RunnerMcpRuntimeFunction,
  RunnerMcpSummary,
  RunnerRepository,
  RunnerRestoreResult,
  RunnerUpdateResult,
} from './types.js'

export class PostgresRunnerRepository implements RunnerRepository {
  async listFunctions(
    organizationId: string,
  ): Promise<RunnerFunctionSummary[]> {
    const rows = await db
      .select()
      .from(runnerFunctions)
      .where(
        and(
          eq(runnerFunctions.organizationId, organizationId),
          eq(runnerFunctions.status, 'active'),
        ),
      )
      .orderBy(desc(runnerFunctions.updatedAt), desc(runnerFunctions.id))
    return rows.map(mapSummary)
  }

  async getFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerGetResult> {
    const [storedFunction] = await db
      .select()
      .from(runnerFunctions)
      .where(
        and(
          eq(runnerFunctions.id, functionId),
          eq(runnerFunctions.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!storedFunction) return { status: 'not_found' }

    const revisionRows = await db
      .select()
      .from(runnerFunctionRevisions)
      .where(eq(runnerFunctionRevisions.functionId, functionId))
      .orderBy(desc(runnerFunctionRevisions.revision))
    const revisions = await Promise.all(
      revisionRows.map(async (revision) => {
        const parameters = await loadParameters(db, revision.id)
        return mapRevision(revision, parameters)
      }),
    )
    const current = revisions.find(
      (revision) => revision.revision === storedFunction.currentRevision,
    )
    if (!current) throw new Error('Current runner revision was not found')
    return {
      status: 'found',
      details: {
        definition: {
          ...mapSummary(storedFunction),
          revision: current,
        },
        revisions,
      },
    }
  }

  async createFunction(
    organizationId: string,
    input: CreateRunnerFunctionInput,
  ): Promise<RunnerFunctionDefinition> {
    return db.transaction(async (transaction) => {
      const [storedFunction] = await transaction
        .insert(runnerFunctions)
        .values({
          organizationId,
          name: input.name,
          description: input.description ?? null,
        })
        .returning()
      if (!storedFunction) throw new Error('Runner function was not created')

      const [revision] = await transaction
        .insert(runnerFunctionRevisions)
        .values({
          functionId: storedFunction.id,
          revision: 1,
          code: input.code,
        })
        .returning()
      if (!revision) throw new Error('Runner function revision was not created')

      if (input.parameters.length > 0) {
        await transaction.insert(runnerRevisionParameters).values(
          input.parameters.map((parameter, position) => ({
            revisionId: revision.id,
            name: parameter.name,
            type: parameter.type,
            required: parameter.required,
            position,
            description: parameter.description ?? null,
          })),
        )
      }

      return mapDefinition(storedFunction, revision, input.parameters)
    })
  }

  async updateFunction(
    organizationId: string,
    functionId: number,
    input: UpdateRunnerFunctionInput,
  ): Promise<RunnerUpdateResult> {
    return db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(runnerFunctions)
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctions.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for('update')
      if (!existing) return { status: 'not_found' }
      if (existing.status === 'archived') return { status: 'archived' }

      const revisionNumber = existing.currentRevision + 1
      const [storedFunction] = await transaction
        .update(runnerFunctions)
        .set({
          name: input.name ?? existing.name,
          description:
            input.description === undefined
              ? existing.description
              : input.description,
          currentRevision: revisionNumber,
          updatedAt: new Date(),
        })
        .where(eq(runnerFunctions.id, existing.id))
        .returning()
      if (!storedFunction) throw new Error('Runner function was not updated')

      const [revision] = await transaction
        .insert(runnerFunctionRevisions)
        .values({
          functionId: existing.id,
          revision: revisionNumber,
          code: input.code,
        })
        .returning()
      if (!revision) throw new Error('Runner function revision was not created')

      if (input.parameters.length > 0) {
        await transaction.insert(runnerRevisionParameters).values(
          input.parameters.map((parameter, position) => ({
            revisionId: revision.id,
            name: parameter.name,
            type: parameter.type,
            required: parameter.required,
            position,
            description: parameter.description ?? null,
          })),
        )
      }

      return {
        status: 'updated',
        definition: mapDefinition(storedFunction, revision, input.parameters),
      }
    })
  }

  async archiveFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerArchiveResult> {
    return db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(runnerFunctions)
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctions.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for('update')
      if (!existing) return { status: 'not_found' }

      const archivedAt = existing.archivedAt ?? new Date()
      const [storedFunction] =
        existing.status === 'archived'
          ? [existing]
          : await transaction
              .update(runnerFunctions)
              .set({
                name: `${existing.name}#Archived${archivedAt.toISOString()}`,
                status: 'archived',
                archivedAt,
                updatedAt: archivedAt,
              })
              .where(eq(runnerFunctions.id, existing.id))
              .returning()
      if (!storedFunction) throw new Error('Runner function was not archived')
      await transaction
        .delete(runnerMcpFunctions)
        .where(eq(runnerMcpFunctions.functionId, existing.id))

      const revision = await loadRevision(
        transaction,
        existing.id,
        existing.currentRevision,
      )
      if (!revision) throw new Error('Current runner revision was not found')
      return {
        status: 'archived',
        definition: mapDefinition(
          storedFunction,
          revision.row,
          revision.parameters,
        ),
      }
    })
  }

  async deleteFunction(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerDeleteFunctionResult> {
    return db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: runnerFunctions.id })
        .from(runnerFunctions)
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctions.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for('update')
      if (!existing) return { status: 'not_found' }

      const [pendingExecution] = await transaction
        .select({ id: runnerExecutionLogs.id })
        .from(runnerExecutionLogs)
        .where(
          and(
            eq(runnerExecutionLogs.organizationId, organizationId),
            eq(runnerExecutionLogs.functionId, functionId),
            inArray(runnerExecutionLogs.status, ['queued', 'running']),
          ),
        )
        .limit(1)
      if (pendingExecution) return { status: 'execution_in_progress' }

      await transaction
        .delete(runnerExecutionLogs)
        .where(
          and(
            eq(runnerExecutionLogs.organizationId, organizationId),
            eq(runnerExecutionLogs.functionId, functionId),
          ),
        )
      await transaction
        .delete(runnerMcpFunctions)
        .where(
          and(
            eq(runnerMcpFunctions.organizationId, organizationId),
            eq(runnerMcpFunctions.functionId, functionId),
          ),
        )
      await transaction
        .update(runnerFunctionApiKeys)
        .set({
          allowedFunctionIds: sql`array_remove(${runnerFunctionApiKeys.allowedFunctionIds}, ${functionId})`,
        })
        .where(
          and(
            eq(runnerFunctionApiKeys.organizationId, organizationId),
            sql`${functionId} = any(${runnerFunctionApiKeys.allowedFunctionIds})`,
          ),
        )

      const deleted = await transaction
        .delete(runnerFunctions)
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctions.organizationId, organizationId),
          ),
        )
        .returning({ id: runnerFunctions.id })
      if (deleted.length === 0) {
        throw new Error('Runner function disappeared during deletion')
      }
      return { status: 'deleted' }
    })
  }

  async restoreRevision(
    organizationId: string,
    functionId: number,
    selectedRevision: number,
  ): Promise<RunnerRestoreResult> {
    return db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(runnerFunctions)
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctions.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for('update')
      if (!existing) return { status: 'not_found' }
      if (existing.status === 'archived') return { status: 'archived' }

      const source = await loadRevision(
        transaction,
        functionId,
        selectedRevision,
      )
      if (!source) return { status: 'not_found' }

      const revisionNumber = existing.currentRevision + 1
      const updatedAt = new Date()
      const [storedFunction] = await transaction
        .update(runnerFunctions)
        .set({ currentRevision: revisionNumber, updatedAt })
        .where(eq(runnerFunctions.id, functionId))
        .returning()
      if (!storedFunction) throw new Error('Runner function was not updated')
      const [revision] = await transaction
        .insert(runnerFunctionRevisions)
        .values({
          functionId,
          revision: revisionNumber,
          code: source.row.code,
        })
        .returning()
      if (!revision) throw new Error('Runner function revision was not created')
      if (source.parameters.length > 0) {
        await transaction.insert(runnerRevisionParameters).values(
          source.parameters.map((parameter, position) => ({
            revisionId: revision.id,
            name: parameter.name,
            type: parameter.type,
            required: parameter.required,
            position,
            description: parameter.description ?? null,
          })),
        )
      }
      return {
        status: 'updated',
        definition: mapDefinition(storedFunction, revision, source.parameters),
      }
    })
  }

  async listMcps(organizationId: string): Promise<RunnerListMcpsResult> {
    const rows = await db
      .select()
      .from(runnerMcps)
      .where(eq(runnerMcps.organizationId, organizationId))
      .orderBy(desc(runnerMcps.updatedAt), desc(runnerMcps.id))
    return {
      status: 'found',
      mcps: await Promise.all(rows.map((row) => mapMcpDefinition(db, row))),
    }
  }

  async getMcp(
    organizationId: string,
    mcpId: number,
  ): Promise<RunnerGetMcpResult> {
    const [storedMcp] = await db
      .select()
      .from(runnerMcps)
      .where(
        and(
          eq(runnerMcps.id, mcpId),
          eq(runnerMcps.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!storedMcp) return { status: 'not_found' }
    return {
      status: 'found',
      mcp: await mapMcpDefinition(db, storedMcp),
    }
  }

  async createMcp(
    organizationId: string,
    input: CreateRunnerMcpInput,
  ): Promise<RunnerCreateMcpResult> {
    return db.transaction(async (transaction) => {
      const invalidFunctionIds = await findInvalidMcpFunctionIds(
        transaction,
        organizationId,
        input.functionIds,
      )
      if (invalidFunctionIds.length > 0) {
        return {
          status: 'invalid_function_ids',
          functionIds: invalidFunctionIds,
        }
      }
      const [storedMcp] = await transaction
        .insert(runnerMcps)
        .values({
          organizationId,
          name: input.name,
          description: input.description ?? null,
        })
        .returning()
      if (!storedMcp) throw new Error('Runner MCP was not created')
      await insertMcpFunctions(
        transaction,
        storedMcp.id,
        organizationId,
        input.functionIds,
      )
      return {
        status: 'created',
        mcp: await mapMcpDefinition(transaction, storedMcp),
      }
    })
  }

  async updateMcp(
    organizationId: string,
    mcpId: number,
    input: UpdateRunnerMcpInput,
  ): Promise<RunnerMcpMutationResult> {
    return db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(runnerMcps)
        .where(
          and(
            eq(runnerMcps.id, mcpId),
            eq(runnerMcps.organizationId, organizationId),
          ),
        )
        .limit(1)
        .for('update')
      if (!existing) return { status: 'not_found' }
      const invalidFunctionIds = await findInvalidMcpFunctionIds(
        transaction,
        organizationId,
        input.functionIds,
      )
      if (invalidFunctionIds.length > 0) {
        return {
          status: 'invalid_function_ids',
          functionIds: invalidFunctionIds,
        }
      }
      const [storedMcp] = await transaction
        .update(runnerMcps)
        .set({
          name: input.name,
          description: input.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(runnerMcps.id, mcpId))
        .returning()
      if (!storedMcp) throw new Error('Runner MCP was not updated')
      await transaction
        .delete(runnerMcpFunctions)
        .where(eq(runnerMcpFunctions.mcpId, mcpId))
      await insertMcpFunctions(
        transaction,
        mcpId,
        organizationId,
        input.functionIds,
      )
      return {
        status: 'updated',
        mcp: await mapMcpDefinition(transaction, storedMcp),
      }
    })
  }

  async deleteMcp(organizationId: string, mcpId: number): Promise<boolean> {
    return db.transaction(async (transaction) => {
      await transaction
        .update(runnerFunctionApiKeys)
        .set({
          allowedMcpIds: sql`array_remove(${runnerFunctionApiKeys.allowedMcpIds}, ${mcpId})`,
        })
        .where(
          and(
            eq(runnerFunctionApiKeys.organizationId, organizationId),
            sql`${mcpId} = any(${runnerFunctionApiKeys.allowedMcpIds})`,
          ),
        )
      const deleted = await transaction
        .delete(runnerMcps)
        .where(
          and(
            eq(runnerMcps.id, mcpId),
            eq(runnerMcps.organizationId, organizationId),
          ),
        )
        .returning({ id: runnerMcps.id })
      return deleted.length > 0
    })
  }

  async exportMcpPackage(
    organizationId: string,
    mcpId: number,
  ): Promise<RunnerMcpPackage | undefined> {
    const [storedMcp] = await db
      .select()
      .from(runnerMcps)
      .where(
        and(
          eq(runnerMcps.id, mcpId),
          eq(runnerMcps.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!storedMcp) return undefined

    const functions = await db
      .select({
        id: runnerFunctions.id,
        name: runnerFunctions.name,
        description: runnerFunctions.description,
        currentRevision: runnerFunctions.currentRevision,
      })
      .from(runnerMcpFunctions)
      .innerJoin(
        runnerFunctions,
        eq(runnerFunctions.id, runnerMcpFunctions.functionId),
      )
      .where(eq(runnerMcpFunctions.mcpId, mcpId))
      .orderBy(asc(runnerMcpFunctions.position))

    return {
      format: 'mba-mcp',
      version: 1,
      mcp: {
        name: storedMcp.name,
        description: storedMcp.description,
        functions: await Promise.all(
          functions.map(async (fn) => {
            const revisions = await db
              .select()
              .from(runnerFunctionRevisions)
              .where(eq(runnerFunctionRevisions.functionId, fn.id))
              .orderBy(asc(runnerFunctionRevisions.revision))
            return {
              name: fn.name,
              description: fn.description,
              currentRevision: fn.currentRevision,
              revisions: await Promise.all(
                revisions.map(async (revision) => ({
                  revision: revision.revision,
                  code: revision.code,
                  parameters: await loadParameters(db, revision.id),
                  createdAt: revision.createdAt.toISOString(),
                })),
              ),
            }
          }),
        ),
      },
    }
  }

  async inspectMcpImport(
    organizationId: string,
    imported: RunnerMcpPackage,
  ): Promise<RunnerMcpImportPreview> {
    return (await inspectMcpImportState(db, organizationId, imported)).preview
  }

  async importMcpPackage(
    organizationId: string,
    imported: RunnerMcpPackage,
    overwrite: boolean,
  ): Promise<RunnerMcpImportResult> {
    return db.transaction(async (transaction) => {
      const inspection = await inspectMcpImportState(
        transaction,
        organizationId,
        imported,
      )
      if (!inspection.preview.canImport) {
        return { status: 'blocked', preview: inspection.preview }
      }
      if (inspection.existingMcp && !overwrite) {
        return { status: 'overwrite_required', preview: inspection.preview }
      }

      const now = new Date()
      let storedMcp: typeof runnerMcps.$inferSelect
      if (inspection.existingMcp) {
        const currentFunctionIds = inspection.currentFunctions.map(
          ({ id }) => id,
        )
        if (currentFunctionIds.length > 0) {
          await transaction
            .delete(runnerExecutionLogs)
            .where(
              and(
                eq(runnerExecutionLogs.organizationId, organizationId),
                inArray(runnerExecutionLogs.functionId, currentFunctionIds),
              ),
            )
          await transaction
            .delete(runnerMcpFunctions)
            .where(eq(runnerMcpFunctions.mcpId, inspection.existingMcp.id))

          const scopedKeys = await transaction
            .select({
              id: runnerFunctionApiKeys.id,
              allowedFunctionIds: runnerFunctionApiKeys.allowedFunctionIds,
            })
            .from(runnerFunctionApiKeys)
            .where(eq(runnerFunctionApiKeys.organizationId, organizationId))
          const removedIds = new Set(currentFunctionIds)
          for (const key of scopedKeys) {
            if (key.allowedFunctionIds === null) continue
            const nextIds = key.allowedFunctionIds.filter(
              (id) => !removedIds.has(id),
            )
            if (nextIds.length === key.allowedFunctionIds.length) continue
            await transaction
              .update(runnerFunctionApiKeys)
              .set({ allowedFunctionIds: nextIds })
              .where(eq(runnerFunctionApiKeys.id, key.id))
          }
          await transaction
            .delete(runnerFunctions)
            .where(
              and(
                eq(runnerFunctions.organizationId, organizationId),
                inArray(runnerFunctions.id, currentFunctionIds),
              ),
            )
        }

        const [updatedMcp] = await transaction
          .update(runnerMcps)
          .set({
            description: imported.mcp.description,
            updatedAt: now,
          })
          .where(eq(runnerMcps.id, inspection.existingMcp.id))
          .returning()
        if (!updatedMcp) throw new Error('Runner MCP was not updated')
        storedMcp = updatedMcp
      } else {
        const [createdMcp] = await transaction
          .insert(runnerMcps)
          .values({
            organizationId,
            name: imported.mcp.name,
            description: imported.mcp.description,
          })
          .returning()
        if (!createdMcp) throw new Error('Runner MCP was not imported')
        storedMcp = createdMcp
      }

      const importedFunctionIds: number[] = []
      for (const [
        position,
        importedFunction,
      ] of imported.mcp.functions.entries()) {
        const targetName = inspection.preview.functions[position]?.targetName
        if (!targetName) throw new Error('Imported function mapping was lost')
        const firstRevision = importedFunction.revisions[0]!
        const currentRevision = importedFunction.revisions.at(-1)!
        const [storedFunction] = await transaction
          .insert(runnerFunctions)
          .values({
            organizationId,
            name: targetName,
            description: importedFunction.description,
            currentRevision: importedFunction.currentRevision,
            createdAt: new Date(firstRevision.createdAt),
            updatedAt: new Date(currentRevision.createdAt),
          })
          .returning({ id: runnerFunctions.id })
        if (!storedFunction) throw new Error('Runner function was not imported')

        const revisions = await transaction
          .insert(runnerFunctionRevisions)
          .values(
            importedFunction.revisions.map((revision) => ({
              functionId: storedFunction.id,
              revision: revision.revision,
              code: revision.code,
              createdAt: new Date(revision.createdAt),
            })),
          )
          .returning({
            id: runnerFunctionRevisions.id,
            revision: runnerFunctionRevisions.revision,
          })
        const revisionIds = new Map(
          revisions.map((revision) => [revision.revision, revision.id]),
        )
        const parameters = importedFunction.revisions.flatMap((revision) => {
          const revisionId = revisionIds.get(revision.revision)
          if (!revisionId) throw new Error('Imported revision was not created')
          return revision.parameters.map((parameter, parameterPosition) => ({
            revisionId,
            name: parameter.name,
            type: parameter.type,
            required: parameter.required,
            position: parameterPosition,
            description: parameter.description ?? null,
          }))
        })
        if (parameters.length > 0) {
          await transaction.insert(runnerRevisionParameters).values(parameters)
        }
        importedFunctionIds.push(storedFunction.id)
      }

      await insertMcpFunctions(
        transaction,
        storedMcp.id,
        organizationId,
        importedFunctionIds,
      )
      return {
        status: 'imported',
        mcp: await mapMcpDefinition(transaction, storedMcp),
      }
    })
  }

  async listApiKeys(organizationId: string): Promise<RunnerListApiKeysResult> {
    const apiKeys = await db
      .select({
        id: runnerFunctionApiKeys.id,
        organizationId: runnerFunctionApiKeys.organizationId,
        allowedFunctionIds: runnerFunctionApiKeys.allowedFunctionIds,
        allowedMcpIds: runnerFunctionApiKeys.allowedMcpIds,
        name: runnerFunctionApiKeys.name,
        keyPrefix: runnerFunctionApiKeys.keyPrefix,
        expiresAt: runnerFunctionApiKeys.expiresAt,
        lastUsedAt: runnerFunctionApiKeys.lastUsedAt,
        revokedAt: runnerFunctionApiKeys.revokedAt,
        createdAt: runnerFunctionApiKeys.createdAt,
      })
      .from(runnerFunctionApiKeys)
      .where(eq(runnerFunctionApiKeys.organizationId, organizationId))
      .orderBy(desc(runnerFunctionApiKeys.createdAt))
    return { status: 'found', apiKeys }
  }

  async listExecutions(
    organizationId: string,
    functionId: number,
  ): Promise<RunnerListExecutionsResult> {
    const [ownedFunction] = await db
      .select({ id: runnerFunctions.id })
      .from(runnerFunctions)
      .where(
        and(
          eq(runnerFunctions.id, functionId),
          eq(runnerFunctions.organizationId, organizationId),
        ),
      )
      .limit(1)
    if (!ownedFunction) return { status: 'not_found' }
    const executions: RunnerExecutionHistoryEntry[] = await db
      .select({
        id: runnerExecutionLogs.id,
        functionId: runnerExecutionLogs.functionId,
        revision: runnerFunctionRevisions.revision,
        apiKeyName: runnerFunctionApiKeys.name,
        status: runnerExecutionLogs.status,
        arguments: runnerExecutionLogs.arguments,
        result: runnerExecutionLogs.result,
        errorMessage: runnerExecutionLogs.errorMessage,
        durationMs: runnerExecutionLogs.durationMs,
        startedAt: runnerExecutionLogs.startedAt,
        finishedAt: runnerExecutionLogs.finishedAt,
      })
      .from(runnerExecutionLogs)
      .innerJoin(
        runnerFunctionRevisions,
        eq(runnerFunctionRevisions.id, runnerExecutionLogs.revisionId),
      )
      .leftJoin(
        runnerFunctionApiKeys,
        eq(runnerFunctionApiKeys.id, runnerExecutionLogs.apiKeyId),
      )
      .where(
        and(
          eq(runnerExecutionLogs.organizationId, organizationId),
          eq(runnerExecutionLogs.functionId, functionId),
        ),
      )
      .orderBy(
        desc(runnerExecutionLogs.startedAt),
        desc(runnerExecutionLogs.id),
      )
      .limit(20)
    return { status: 'found', executions }
  }

  async createApiKey(
    organizationId: string,
    input: CreateRunnerApiKeyInput & { keyPrefix: string; keyHash: string },
  ): Promise<RunnerCreateApiKeyResult> {
    return db.transaction(async (transaction) => {
      let invalidFunctionIds: number[] = []
      if (input.allowedFunctionIds !== null) {
        const ownedFunctions =
          input.allowedFunctionIds.length === 0
            ? []
            : await transaction
                .select({ id: runnerFunctions.id })
                .from(runnerFunctions)
                .where(
                  and(
                    eq(runnerFunctions.organizationId, organizationId),
                    eq(runnerFunctions.status, 'active'),
                    inArray(runnerFunctions.id, input.allowedFunctionIds),
                  ),
                )
        const ownedIds = new Set(ownedFunctions.map(({ id }) => id))
        invalidFunctionIds = input.allowedFunctionIds.filter(
          (id) => !ownedIds.has(id),
        )
      }
      let invalidMcpIds: number[] = []
      if (input.allowedMcpIds !== null) {
        const ownedMcps =
          input.allowedMcpIds.length === 0
            ? []
            : await transaction
                .select({ id: runnerMcps.id })
                .from(runnerMcps)
                .where(
                  and(
                    eq(runnerMcps.organizationId, organizationId),
                    inArray(runnerMcps.id, input.allowedMcpIds),
                  ),
                )
        const ownedIds = new Set(ownedMcps.map(({ id }) => id))
        invalidMcpIds = input.allowedMcpIds.filter((id) => !ownedIds.has(id))
      }
      if (invalidFunctionIds.length > 0 || invalidMcpIds.length > 0) {
        return {
          status: 'invalid_scope_ids',
          functionIds: invalidFunctionIds,
          mcpIds: invalidMcpIds,
        }
      }
      const [apiKey] = await transaction
        .insert(runnerFunctionApiKeys)
        .values({
          organizationId,
          allowedFunctionIds: input.allowedFunctionIds,
          allowedMcpIds: input.allowedMcpIds,
          name: input.name,
          keyPrefix: input.keyPrefix,
          keyHash: input.keyHash,
          expiresAt: input.expiresAt,
        })
        .returning({
          id: runnerFunctionApiKeys.id,
          organizationId: runnerFunctionApiKeys.organizationId,
          allowedFunctionIds: runnerFunctionApiKeys.allowedFunctionIds,
          allowedMcpIds: runnerFunctionApiKeys.allowedMcpIds,
          name: runnerFunctionApiKeys.name,
          keyPrefix: runnerFunctionApiKeys.keyPrefix,
          expiresAt: runnerFunctionApiKeys.expiresAt,
          lastUsedAt: runnerFunctionApiKeys.lastUsedAt,
          revokedAt: runnerFunctionApiKeys.revokedAt,
          createdAt: runnerFunctionApiKeys.createdAt,
        })
      if (!apiKey) throw new Error('Runner API key was not created')
      return { status: 'created', apiKey }
    })
  }

  async upsertUiApiKey(
    organizationId: string,
    input: { keyPrefix: string; keyHash: string; expiresAt: Date },
  ): Promise<RunnerApiKeyMetadata> {
    return db.transaction(async (transaction) => {
      const [ownedOrganization] = await transaction
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1)
        .for('update')
      if (!ownedOrganization) {
        throw new Error('Runner API key organization was not found')
      }
      const [existing] = await transaction
        .select({ id: runnerFunctionApiKeys.id })
        .from(runnerFunctionApiKeys)
        .where(
          and(
            eq(runnerFunctionApiKeys.organizationId, organizationId),
            eq(runnerFunctionApiKeys.name, 'UI'),
          ),
        )
        .orderBy(runnerFunctionApiKeys.id)
        .limit(1)
      const values = {
        organizationId,
        allowedFunctionIds: null,
        allowedMcpIds: null,
        name: 'UI',
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        expiresAt: input.expiresAt,
        lastUsedAt: null,
        revokedAt: null,
      }
      const [apiKey] = existing
        ? await transaction
            .update(runnerFunctionApiKeys)
            .set(values)
            .where(eq(runnerFunctionApiKeys.id, existing.id))
            .returning()
        : await transaction
            .insert(runnerFunctionApiKeys)
            .values(values)
            .returning()
      if (!apiKey) throw new Error('Runner UI API key was not upserted')
      return mapApiKey(apiKey)
    })
  }

  async revokeApiKey(
    organizationId: string,
    apiKeyId: number,
  ): Promise<boolean> {
    const revoked = await db
      .update(runnerFunctionApiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(runnerFunctionApiKeys.id, apiKeyId),
          eq(runnerFunctionApiKeys.organizationId, organizationId),
        ),
      )
      .returning({ id: runnerFunctionApiKeys.id })
    return revoked.length > 0
  }

  async getMcpRuntimeByApiKey(
    mcpId: number,
    keyHash: string,
  ): Promise<RunnerGetMcpRuntimeResult> {
    return db.transaction(async (transaction) => {
      const [apiKey] = await transaction
        .select({
          organizationId: runnerFunctionApiKeys.organizationId,
          allowedFunctionIds: runnerFunctionApiKeys.allowedFunctionIds,
          allowedMcpIds: runnerFunctionApiKeys.allowedMcpIds,
        })
        .from(runnerFunctionApiKeys)
        .where(
          and(
            eq(runnerFunctionApiKeys.keyHash, keyHash),
            isNull(runnerFunctionApiKeys.revokedAt),
            gt(runnerFunctionApiKeys.expiresAt, new Date()),
          ),
        )
        .limit(1)
      if (!apiKey) return { status: 'invalid_key' }

      const [storedMcp] = await transaction
        .select({
          id: runnerMcps.id,
          organizationId: runnerMcps.organizationId,
          name: runnerMcps.name,
          description: runnerMcps.description,
        })
        .from(runnerMcps)
        .where(
          and(
            eq(runnerMcps.id, mcpId),
            eq(runnerMcps.organizationId, apiKey.organizationId),
          ),
        )
        .limit(1)
      if (!storedMcp) return { status: 'not_found' }

      const unrestricted =
        apiKey.allowedFunctionIds === null && apiKey.allowedMcpIds === null
      const authorizedFunctionIds = new Set(apiKey.allowedFunctionIds ?? [])
      if (apiKey.allowedMcpIds && apiKey.allowedMcpIds.length > 0) {
        const grantedFunctions = await transaction
          .select({ functionId: runnerMcpFunctions.functionId })
          .from(runnerMcpFunctions)
          .where(
            and(
              eq(runnerMcpFunctions.organizationId, apiKey.organizationId),
              inArray(runnerMcpFunctions.mcpId, apiKey.allowedMcpIds),
            ),
          )
        for (const { functionId } of grantedFunctions) {
          authorizedFunctionIds.add(functionId)
        }
      }

      const rows = await transaction
        .select({
          id: runnerFunctions.id,
          name: runnerFunctions.name,
          description: runnerFunctions.description,
          currentRevision: runnerFunctions.currentRevision,
          parameterId: runnerRevisionParameters.id,
          parameterName: runnerRevisionParameters.name,
          parameterType: runnerRevisionParameters.type,
          parameterRequired: runnerRevisionParameters.required,
          parameterDescription: runnerRevisionParameters.description,
        })
        .from(runnerMcpFunctions)
        .innerJoin(
          runnerFunctions,
          eq(runnerFunctions.id, runnerMcpFunctions.functionId),
        )
        .innerJoin(
          runnerFunctionRevisions,
          and(
            eq(runnerFunctionRevisions.functionId, runnerFunctions.id),
            eq(
              runnerFunctionRevisions.revision,
              runnerFunctions.currentRevision,
            ),
          ),
        )
        .leftJoin(
          runnerRevisionParameters,
          eq(runnerRevisionParameters.revisionId, runnerFunctionRevisions.id),
        )
        .where(
          and(
            eq(runnerMcpFunctions.mcpId, mcpId),
            eq(runnerMcpFunctions.organizationId, apiKey.organizationId),
            eq(runnerFunctions.status, 'active'),
          ),
        )
        .orderBy(
          asc(runnerMcpFunctions.position),
          asc(runnerRevisionParameters.position),
        )

      const functions: RunnerMcpRuntimeFunction[] = []
      const functionsById = new Map<number, RunnerMcpRuntimeFunction>()
      for (const row of rows) {
        if (!unrestricted && !authorizedFunctionIds.has(row.id)) continue
        let runtimeFunction = functionsById.get(row.id)
        if (!runtimeFunction) {
          runtimeFunction = {
            id: row.id,
            name: row.name,
            description: row.description,
            currentRevision: row.currentRevision,
            parameters: [],
          }
          functionsById.set(row.id, runtimeFunction)
          functions.push(runtimeFunction)
        }
        if (row.parameterId !== null) {
          runtimeFunction.parameters.push({
            name: row.parameterName!,
            type: row.parameterType!,
            required: row.parameterRequired!,
            description: row.parameterDescription,
          })
        }
      }

      const hasWholeMcpAccess =
        unrestricted || apiKey.allowedMcpIds?.includes(mcpId) === true
      if (!hasWholeMcpAccess && functions.length === 0) {
        return { status: 'forbidden' }
      }
      return {
        status: 'found',
        mcp: { ...storedMcp, functions },
      }
    })
  }

  async getExecutionRevisionByApiKey(
    functionId: number,
    keyHash: string,
    requestedRevision?: number,
  ): Promise<RunnerExecutionRevision | undefined> {
    return db.transaction(async (transaction) => {
      const [match] = await transaction
        .select({
          apiKeyId: runnerFunctionApiKeys.id,
          organizationId: runnerFunctions.organizationId,
          functionStatus: runnerFunctions.status,
          currentRevision: runnerFunctions.currentRevision,
        })
        .from(runnerFunctionApiKeys)
        .innerJoin(
          runnerFunctions,
          eq(
            runnerFunctions.organizationId,
            runnerFunctionApiKeys.organizationId,
          ),
        )
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctionApiKeys.keyHash, keyHash),
            isNull(runnerFunctionApiKeys.revokedAt),
            gt(runnerFunctionApiKeys.expiresAt, new Date()),
            sql`(
              (${runnerFunctionApiKeys.allowedFunctionIds} is null and ${runnerFunctionApiKeys.allowedMcpIds} is null)
              or ${functionId} = any(coalesce(${runnerFunctionApiKeys.allowedFunctionIds}, array[]::bigint[]))
              or exists (
                select 1
                from ${runnerMcpFunctions}
                where ${runnerMcpFunctions.organizationId} = ${runnerFunctionApiKeys.organizationId}
                  and ${runnerMcpFunctions.functionId} = ${functionId}
                  and ${runnerMcpFunctions.mcpId} = any(coalesce(${runnerFunctionApiKeys.allowedMcpIds}, array[]::bigint[]))
              )
            )`,
          ),
        )
        .limit(1)
      if (!match) return undefined
      const revision = await loadRevision(
        transaction,
        functionId,
        requestedRevision ?? match.currentRevision,
      )
      if (!revision) return undefined
      await transaction
        .update(runnerFunctionApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(runnerFunctionApiKeys.id, match.apiKeyId))
      return {
        functionId,
        organizationId: match.organizationId,
        functionStatus: match.functionStatus,
        apiKeyId: match.apiKeyId,
        revision: mapRevision(revision.row, revision.parameters),
      }
    })
  }

  async getMcpExecutionRevisionByApiKey(
    mcpId: number,
    functionId: number,
    keyHash: string,
  ): Promise<RunnerExecutionRevision | undefined> {
    return db.transaction(async (transaction) => {
      const [match] = await transaction
        .select({
          apiKeyId: runnerFunctionApiKeys.id,
          organizationId: runnerFunctions.organizationId,
          functionStatus: runnerFunctions.status,
          currentRevision: runnerFunctions.currentRevision,
        })
        .from(runnerFunctionApiKeys)
        .innerJoin(
          runnerFunctions,
          eq(
            runnerFunctions.organizationId,
            runnerFunctionApiKeys.organizationId,
          ),
        )
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctionApiKeys.keyHash, keyHash),
            isNull(runnerFunctionApiKeys.revokedAt),
            gt(runnerFunctionApiKeys.expiresAt, new Date()),
            sql`exists (
              select 1
              from ${runnerMcpFunctions}
              where ${runnerMcpFunctions.organizationId} = ${runnerFunctionApiKeys.organizationId}
                and ${runnerMcpFunctions.mcpId} = ${mcpId}
                and ${runnerMcpFunctions.functionId} = ${functionId}
            )`,
            sql`(
              (${runnerFunctionApiKeys.allowedFunctionIds} is null and ${runnerFunctionApiKeys.allowedMcpIds} is null)
              or ${functionId} = any(coalesce(${runnerFunctionApiKeys.allowedFunctionIds}, array[]::bigint[]))
              or exists (
                select 1
                from ${runnerMcpFunctions}
                where ${runnerMcpFunctions.organizationId} = ${runnerFunctionApiKeys.organizationId}
                  and ${runnerMcpFunctions.functionId} = ${functionId}
                  and ${runnerMcpFunctions.mcpId} = any(coalesce(${runnerFunctionApiKeys.allowedMcpIds}, array[]::bigint[]))
              )
            )`,
          ),
        )
        .limit(1)
      if (!match) return undefined
      const revision = await loadRevision(
        transaction,
        functionId,
        match.currentRevision,
      )
      if (!revision) return undefined
      await transaction
        .update(runnerFunctionApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(runnerFunctionApiKeys.id, match.apiKeyId))
      return {
        functionId,
        organizationId: match.organizationId,
        functionStatus: match.functionStatus,
        apiKeyId: match.apiKeyId,
        revision: mapRevision(revision.row, revision.parameters),
      }
    })
  }

  async getExecutionRevisionForOrganization(
    organizationId: string,
    functionId: number,
    apiKeyId: number,
    requestedRevision?: number,
  ): Promise<RunnerExecutionRevision | undefined> {
    return db.transaction(async (transaction) => {
      const [storedFunction] = await transaction
        .select({
          organizationId: runnerFunctions.organizationId,
          functionStatus: runnerFunctions.status,
          currentRevision: runnerFunctions.currentRevision,
        })
        .from(runnerFunctions)
        .where(
          and(
            eq(runnerFunctions.id, functionId),
            eq(runnerFunctions.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (!storedFunction) return undefined
      const revision = await loadRevision(
        transaction,
        functionId,
        requestedRevision ?? storedFunction.currentRevision,
      )
      if (!revision) return undefined
      const usedKey = await transaction
        .update(runnerFunctionApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(
          and(
            eq(runnerFunctionApiKeys.id, apiKeyId),
            eq(runnerFunctionApiKeys.organizationId, organizationId),
          ),
        )
        .returning({ id: runnerFunctionApiKeys.id })
      if (usedKey.length === 0) return undefined
      return {
        functionId,
        organizationId,
        functionStatus: storedFunction.functionStatus,
        apiKeyId,
        revision: mapRevision(revision.row, revision.parameters),
      }
    })
  }

  async createExecutionLog(
    execution: RunnerExecutionRevision,
    parameters: Record<string, unknown>,
  ) {
    const [log] = await db
      .insert(runnerExecutionLogs)
      .values({
        organizationId: execution.organizationId,
        functionId: execution.functionId,
        revisionId: execution.revision.id,
        apiKeyId: execution.apiKeyId,
        arguments: parameters,
      })
      .returning({
        id: runnerExecutionLogs.id,
        startedAt: runnerExecutionLogs.startedAt,
      })
    if (!log) throw new Error('Runner execution log was not created')
    return log
  }

  async claimExecution(
    executionId: number,
  ): Promise<RunnerClaimedExecution | undefined> {
    return db.transaction(async (transaction) => {
      const [claimed] = await transaction
        .update(runnerExecutionLogs)
        .set({ status: 'running' })
        .where(
          and(
            eq(runnerExecutionLogs.id, executionId),
            eq(runnerExecutionLogs.status, 'queued'),
          ),
        )
        .returning({
          executionId: runnerExecutionLogs.id,
          functionId: runnerExecutionLogs.functionId,
          revisionId: runnerExecutionLogs.revisionId,
          parameters: runnerExecutionLogs.arguments,
          startedAt: runnerExecutionLogs.startedAt,
        })
      if (!claimed) return undefined

      const [revision] = await transaction
        .select({
          revision: runnerFunctionRevisions.revision,
          code: runnerFunctionRevisions.code,
        })
        .from(runnerFunctionRevisions)
        .where(eq(runnerFunctionRevisions.id, claimed.revisionId))
        .limit(1)
      if (!revision) {
        throw new Error('Claimed runner execution revision was not found')
      }

      return {
        executionId: claimed.executionId,
        functionId: claimed.functionId,
        revision: revision.revision,
        code: revision.code,
        parameters: claimed.parameters,
        startedAt: claimed.startedAt,
      }
    })
  }

  async getExecutionResult(
    executionId: number,
  ): Promise<RunnerExecutionResultState> {
    const [execution] = await db
      .select({
        executionId: runnerExecutionLogs.id,
        functionId: runnerExecutionLogs.functionId,
        revision: runnerFunctionRevisions.revision,
        status: runnerExecutionLogs.status,
        result: runnerExecutionLogs.result,
        errorMessage: runnerExecutionLogs.errorMessage,
        durationMs: runnerExecutionLogs.durationMs,
        startedAt: runnerExecutionLogs.startedAt,
        finishedAt: runnerExecutionLogs.finishedAt,
      })
      .from(runnerExecutionLogs)
      .innerJoin(
        runnerFunctionRevisions,
        eq(runnerFunctionRevisions.id, runnerExecutionLogs.revisionId),
      )
      .where(eq(runnerExecutionLogs.id, executionId))
      .limit(1)
    if (!execution) return { status: 'not_found' }
    if (execution.status === 'queued' || execution.status === 'running') {
      return { status: 'pending' }
    }
    if (execution.durationMs === null || execution.finishedAt === null) {
      throw new Error('Terminal runner execution is missing outcome metadata')
    }
    if (execution.status === 'succeeded') {
      return {
        status: 'finished',
        execution: {
          executionId: execution.executionId,
          functionId: execution.functionId,
          revision: execution.revision,
          status: 'succeeded',
          result: execution.result,
          durationMs: execution.durationMs,
          startedAt: execution.startedAt,
          finishedAt: execution.finishedAt,
        },
      }
    }
    return {
      status: 'finished',
      execution: {
        executionId: execution.executionId,
        functionId: execution.functionId,
        revision: execution.revision,
        status: execution.status,
        errorMessage:
          execution.errorMessage ?? 'Runner execution failed without an error',
        durationMs: execution.durationMs,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
      },
    }
  }

  async finishExecutionLog(
    executionId: number,
    outcome: RunnerExecutionLogOutcome,
  ): Promise<void> {
    await db
      .update(runnerExecutionLogs)
      .set({
        status: outcome.status,
        result:
          outcome.status === 'succeeded' ? (outcome.result ?? null) : null,
        errorMessage: outcome.errorMessage ?? null,
        durationMs: outcome.durationMs,
        finishedAt: outcome.finishedAt,
      })
      .where(eq(runnerExecutionLogs.id, executionId))
  }
}

type QueryDatabase = Pick<typeof db, 'select'>

type McpDatabase = Pick<typeof db, 'select' | 'insert'>

interface McpImportInspectionState {
  preview: RunnerMcpImportPreview
  existingMcp: typeof runnerMcps.$inferSelect | undefined
  currentFunctions: Array<{ id: number; name: string }>
}

async function inspectMcpImportState(
  database: QueryDatabase,
  organizationId: string,
  imported: RunnerMcpPackage,
): Promise<McpImportInspectionState> {
  const [existingMcp] = await database
    .select()
    .from(runnerMcps)
    .where(
      and(
        eq(runnerMcps.organizationId, organizationId),
        eq(runnerMcps.name, imported.mcp.name),
      ),
    )
    .limit(1)
  const currentFunctions = existingMcp
    ? await database
        .select({ id: runnerFunctions.id, name: runnerFunctions.name })
        .from(runnerMcpFunctions)
        .innerJoin(
          runnerFunctions,
          eq(runnerFunctions.id, runnerMcpFunctions.functionId),
        )
        .where(eq(runnerMcpFunctions.mcpId, existingMcp.id))
        .orderBy(asc(runnerMcpFunctions.position))
    : []
  const currentFunctionIds = currentFunctions.map(({ id }) => id)
  const currentIds = new Set(currentFunctionIds)
  const currentNames = new Map(currentFunctions.map((fn) => [fn.id, fn.name]))
  const previewFunctions = imported.mcp.functions.map((fn) => ({
    sourceName: fn.name,
    targetName: getRunnerMcpImportTargetName(imported.mcp.name, fn.name),
    currentRevision: fn.currentRevision,
    revisionCount: fn.revisions.length,
  }))
  const targetNames = previewFunctions.map(({ targetName }) => targetName)
  const targetNameSet = new Set(targetNames)
  const blockers: RunnerMcpImportBlocker[] = []

  const duplicateTargetNames = [
    ...new Set(
      targetNames.filter((name, index) => targetNames.indexOf(name) !== index),
    ),
  ]
  if (duplicateTargetNames.length > 0) {
    blockers.push({
      code: 'duplicate_target_names',
      functionNames: duplicateTargetNames,
    })
  }
  const tooLongNames = targetNames.filter(
    (name) => !isRunnerMcpImportTargetNameValid(name),
  )
  if (tooLongNames.length > 0) {
    blockers.push({
      code: 'target_names_too_long',
      functionNames: tooLongNames,
    })
  }

  const collisions =
    targetNames.length === 0
      ? []
      : await database
          .select({ id: runnerFunctions.id, name: runnerFunctions.name })
          .from(runnerFunctions)
          .where(
            and(
              eq(runnerFunctions.organizationId, organizationId),
              inArray(runnerFunctions.name, targetNames),
            ),
          )
  const conflictingNames = collisions
    .filter(({ id }) => !currentIds.has(id))
    .map(({ name }) => name)
  if (conflictingNames.length > 0) {
    blockers.push({
      code: 'target_name_conflicts',
      functionNames: conflictingNames,
    })
  }

  let affectedExecutionCount = 0
  let affectedApiKeyCount = 0
  if (currentFunctionIds.length > 0 && existingMcp) {
    const [sharedMemberships, activeExecutions, executionCount, scopedKeys] =
      await Promise.all([
        database
          .select({ functionId: runnerMcpFunctions.functionId })
          .from(runnerMcpFunctions)
          .where(
            and(
              eq(runnerMcpFunctions.organizationId, organizationId),
              inArray(runnerMcpFunctions.functionId, currentFunctionIds),
              ne(runnerMcpFunctions.mcpId, existingMcp.id),
            ),
          ),
        database
          .select({ functionId: runnerExecutionLogs.functionId })
          .from(runnerExecutionLogs)
          .where(
            and(
              eq(runnerExecutionLogs.organizationId, organizationId),
              inArray(runnerExecutionLogs.functionId, currentFunctionIds),
              inArray(runnerExecutionLogs.status, ['queued', 'running']),
            ),
          ),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(runnerExecutionLogs)
          .where(
            and(
              eq(runnerExecutionLogs.organizationId, organizationId),
              inArray(runnerExecutionLogs.functionId, currentFunctionIds),
            ),
          ),
        database
          .select({
            allowedFunctionIds: runnerFunctionApiKeys.allowedFunctionIds,
          })
          .from(runnerFunctionApiKeys)
          .where(eq(runnerFunctionApiKeys.organizationId, organizationId)),
      ])
    const sharedNames = [
      ...new Set(
        sharedMemberships.flatMap(({ functionId }) => {
          const name = currentNames.get(functionId)
          return name ? [name] : []
        }),
      ),
    ]
    if (sharedNames.length > 0) {
      blockers.push({ code: 'shared_functions', functionNames: sharedNames })
    }
    const activeNames = [
      ...new Set(
        activeExecutions.flatMap(({ functionId }) => {
          const name = currentNames.get(functionId)
          return name ? [name] : []
        }),
      ),
    ]
    if (activeNames.length > 0) {
      blockers.push({ code: 'active_executions', functionNames: activeNames })
    }
    affectedExecutionCount = executionCount[0]?.count ?? 0
    affectedApiKeyCount = scopedKeys.filter((key) =>
      key.allowedFunctionIds?.some((id) => currentIds.has(id)),
    ).length
  }

  const preview: RunnerMcpImportPreview = {
    mode: existingMcp ? 'overwrite' : 'create',
    existingMcpId: existingMcp?.id ?? null,
    mcpName: imported.mcp.name,
    description: imported.mcp.description,
    functions: previewFunctions,
    removedFunctionNames: currentFunctions
      .map(({ name }) => name)
      .filter((name) => !targetNameSet.has(name)),
    affectedApiKeyCount,
    affectedExecutionCount,
    blockers,
    canImport: blockers.length === 0,
  }
  return { preview, existingMcp, currentFunctions }
}

async function findInvalidMcpFunctionIds(
  database: Pick<typeof db, 'select'>,
  organizationId: string,
  functionIds: number[],
): Promise<number[]> {
  const ownedFunctions = await database
    .select({ id: runnerFunctions.id })
    .from(runnerFunctions)
    .where(
      and(
        eq(runnerFunctions.organizationId, organizationId),
        eq(runnerFunctions.status, 'active'),
        inArray(runnerFunctions.id, functionIds),
      ),
    )
  const ownedIds = new Set(ownedFunctions.map(({ id }) => id))
  return functionIds.filter((id) => !ownedIds.has(id))
}

async function insertMcpFunctions(
  database: McpDatabase,
  mcpId: number,
  organizationId: string,
  functionIds: number[],
): Promise<void> {
  await database.insert(runnerMcpFunctions).values(
    functionIds.map((functionId, position) => ({
      mcpId,
      functionId,
      organizationId,
      position,
    })),
  )
}

async function mapMcpDefinition(
  database: Pick<typeof db, 'select'>,
  storedMcp: typeof runnerMcps.$inferSelect,
): Promise<RunnerMcpDefinition> {
  const functions = await database
    .select({
      id: runnerFunctions.id,
      name: runnerFunctions.name,
      description: runnerFunctions.description,
      currentRevision: runnerFunctions.currentRevision,
    })
    .from(runnerMcpFunctions)
    .innerJoin(
      runnerFunctions,
      eq(runnerFunctions.id, runnerMcpFunctions.functionId),
    )
    .where(eq(runnerMcpFunctions.mcpId, storedMcp.id))
    .orderBy(asc(runnerMcpFunctions.position))
  return {
    ...mapMcpSummary(
      storedMcp,
      functions.length,
      functions.map((item) => item.name),
    ),
    functions,
  }
}

function mapMcpSummary(
  storedMcp: typeof runnerMcps.$inferSelect,
  functionCount: number,
  functionNames: string[],
): RunnerMcpSummary {
  return {
    id: storedMcp.id,
    organizationId: storedMcp.organizationId,
    name: storedMcp.name,
    description: storedMcp.description,
    functionCount,
    functionNames,
    createdAt: storedMcp.createdAt,
    updatedAt: storedMcp.updatedAt,
  }
}

async function loadRevision(
  database: QueryDatabase,
  functionId: number,
  revisionNumber: number,
) {
  const [row] = await database
    .select()
    .from(runnerFunctionRevisions)
    .where(
      and(
        eq(runnerFunctionRevisions.functionId, functionId),
        eq(runnerFunctionRevisions.revision, revisionNumber),
      ),
    )
    .limit(1)
  if (!row) return undefined
  const parameters = await loadParameters(database, row.id)
  return { row, parameters }
}

async function loadParameters(database: QueryDatabase, revisionId: number) {
  const parameters = await database
    .select()
    .from(runnerRevisionParameters)
    .where(eq(runnerRevisionParameters.revisionId, revisionId))
    .orderBy(asc(runnerRevisionParameters.position))
  return parameters.map((parameter) => ({
    name: parameter.name,
    type: parameter.type,
    required: parameter.required,
    description: parameter.description,
  }))
}

function mapSummary(
  storedFunction: typeof runnerFunctions.$inferSelect,
): RunnerFunctionSummary {
  return {
    id: storedFunction.id,
    organizationId: storedFunction.organizationId,
    name: storedFunction.name,
    description: storedFunction.description,
    status: storedFunction.status,
    currentRevision: storedFunction.currentRevision,
    archivedAt: storedFunction.archivedAt,
    createdAt: storedFunction.createdAt,
    updatedAt: storedFunction.updatedAt,
  }
}

function mapApiKey(
  apiKey: typeof runnerFunctionApiKeys.$inferSelect,
): RunnerApiKeyMetadata {
  return {
    id: apiKey.id,
    organizationId: apiKey.organizationId,
    allowedFunctionIds: apiKey.allowedFunctionIds,
    allowedMcpIds: apiKey.allowedMcpIds,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    expiresAt: apiKey.expiresAt,
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
  }
}

function mapDefinition(
  storedFunction: typeof runnerFunctions.$inferSelect,
  revision: typeof runnerFunctionRevisions.$inferSelect,
  parameters: RunnerParameterDefinition[],
): RunnerFunctionDefinition {
  return {
    ...mapSummary(storedFunction),
    revision: mapRevision(revision, parameters),
  }
}

function mapRevision(
  revision: typeof runnerFunctionRevisions.$inferSelect,
  parameters: RunnerParameterDefinition[],
): RunnerFunctionRevision {
  return {
    id: revision.id,
    revision: revision.revision,
    code: revision.code,
    parameters,
    createdAt: revision.createdAt,
  }
}

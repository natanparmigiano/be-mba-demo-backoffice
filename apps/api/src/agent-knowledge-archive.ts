import { createHash, randomUUID } from 'node:crypto'
import { agentKnowledgeFileArchives, db } from '@mba-demo/db'
import { files, type FileStore } from '@mba-demo/files'
import type { KnowledgeFile } from '@mba-demo/wa-mba'
import { and, eq, inArray } from 'drizzle-orm'

export interface ArchivedAgentKnowledgeFile {
  body: Uint8Array | null
  contentType?: string
  providerFileId: string
  storagePath?: string
}

export interface AgentKnowledgeArchive {
  put(
    organizationId: string,
    channelId: number,
    providerFile: KnowledgeFile,
    file: File,
  ): Promise<void>
  getMany(
    organizationId: string,
    providerFileIds: readonly string[],
  ): Promise<ArchivedAgentKnowledgeFile[]>
  delete(organizationId: string, providerFileId: string): Promise<void>
}

export function createAgentKnowledgeArchive(
  fileStore: FileStore = files,
): AgentKnowledgeArchive {
  return {
    async put(organizationId, channelId, providerFile, file) {
      const [previous] = await db
        .select({ storagePath: agentKnowledgeFileArchives.storagePath })
        .from(agentKnowledgeFileArchives)
        .where(
          and(
            eq(agentKnowledgeFileArchives.organizationId, organizationId),
            eq(agentKnowledgeFileArchives.providerFileId, providerFile.id),
          ),
        )
        .limit(1)
      const storagePath = buildStoragePath(organizationId, channelId, file.name)
      await fileStore.put(
        storagePath,
        new Uint8Array(await file.arrayBuffer()),
        {
          contentType: file.type || undefined,
        },
      )

      try {
        await db
          .insert(agentKnowledgeFileArchives)
          .values({
            organizationId,
            providerFileId: providerFile.id,
            storagePath,
          })
          .onConflictDoUpdate({
            target: [
              agentKnowledgeFileArchives.organizationId,
              agentKnowledgeFileArchives.providerFileId,
            ],
            set: { storagePath },
          })
      } catch (error) {
        await fileStore.delete(storagePath).catch(() => undefined)
        throw error
      }

      if (previous && previous.storagePath !== storagePath) {
        await fileStore.delete(previous.storagePath).catch(() => undefined)
      }
    },

    async getMany(organizationId, providerFileIds) {
      if (providerFileIds.length === 0) return []
      const rows = await db
        .select({
          providerFileId: agentKnowledgeFileArchives.providerFileId,
          storagePath: agentKnowledgeFileArchives.storagePath,
        })
        .from(agentKnowledgeFileArchives)
        .where(
          and(
            eq(agentKnowledgeFileArchives.organizationId, organizationId),
            inArray(agentKnowledgeFileArchives.providerFileId, [
              ...providerFileIds,
            ]),
          ),
        )
      const byProviderId = new Map(
        rows.map((row) => [row.providerFileId, row.storagePath]),
      )

      return Promise.all(
        providerFileIds.map(async (providerFileId) => {
          const storagePath = byProviderId.get(providerFileId)
          if (!storagePath) return { body: null, providerFileId }
          const stored = await fileStore.get(storagePath)
          return {
            body: stored?.body ?? null,
            contentType: stored?.contentType,
            providerFileId,
            storagePath,
          }
        }),
      )
    },

    async delete(organizationId, providerFileId) {
      const deleted = await db
        .delete(agentKnowledgeFileArchives)
        .where(
          and(
            eq(agentKnowledgeFileArchives.organizationId, organizationId),
            eq(agentKnowledgeFileArchives.providerFileId, providerFileId),
          ),
        )
        .returning({ storagePath: agentKnowledgeFileArchives.storagePath })
      await Promise.all(
        deleted.map(({ storagePath }) =>
          fileStore.delete(storagePath).catch(() => undefined),
        ),
      )
    },
  }
}

function buildStoragePath(
  organizationId: string,
  channelId: number,
  fileName: string,
): string {
  const organizationKey = createHash('sha256')
    .update(organizationId)
    .digest('hex')
    .slice(0, 24)
  const extension = safeExtension(fileName)
  return `agent-knowledge/${organizationKey}/${channelId}/${randomUUID()}${extension}`
}

function safeExtension(fileName: string): string {
  const match = /\.[a-z\d]{1,10}$/i.exec(fileName)
  return match?.[0].toLowerCase() ?? ''
}

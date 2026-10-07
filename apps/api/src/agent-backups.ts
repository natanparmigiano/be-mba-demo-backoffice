import { createHash, randomUUID } from 'node:crypto'
import { agentBackups, db } from '@mba-desk/db'
import { files, type FileStore } from '@mba-desk/files'
import { and, desc, eq } from 'drizzle-orm'

export interface AgentBackupSummary {
  id: number
  channelId: number
  fileName: string
  byteSize: number
  createdAt: Date
}

export interface AgentBackupArchive {
  backup: AgentBackupSummary
  archive: Uint8Array
}

export interface AgentBackupService {
  list(organizationId: string, channelId: number): Promise<AgentBackupSummary[]>
  create(
    organizationId: string,
    channelId: number,
    fileName: string,
    archive: Uint8Array,
  ): Promise<AgentBackupSummary>
  getArchive(
    organizationId: string,
    channelId: number,
    backupId: number,
  ): Promise<AgentBackupArchive | null>
  deleteStoredFiles(storagePaths: readonly string[]): Promise<void>
}

export function createAgentBackupService(
  fileStore: FileStore = files,
): AgentBackupService {
  return {
    async list(organizationId, channelId) {
      return db
        .select({
          id: agentBackups.id,
          channelId: agentBackups.channelId,
          fileName: agentBackups.fileName,
          byteSize: agentBackups.byteSize,
          createdAt: agentBackups.createdAt,
        })
        .from(agentBackups)
        .where(
          and(
            eq(agentBackups.organizationId, organizationId),
            eq(agentBackups.channelId, channelId),
          ),
        )
        .orderBy(desc(agentBackups.createdAt), desc(agentBackups.id))
    },

    async create(organizationId, channelId, fileName, archive) {
      if (archive.byteLength < 1) {
        throw new TypeError('Agent backup archive must not be empty')
      }
      const storagePath = backupStoragePath(organizationId, channelId)
      await fileStore.put(storagePath, archive, {
        contentType: 'application/vnd.mba.agent+zip',
      })

      try {
        const [backup] = await db
          .insert(agentBackups)
          .values({
            organizationId,
            channelId,
            fileName,
            storagePath,
            byteSize: archive.byteLength,
          })
          .returning({
            id: agentBackups.id,
            channelId: agentBackups.channelId,
            fileName: agentBackups.fileName,
            byteSize: agentBackups.byteSize,
            createdAt: agentBackups.createdAt,
          })
        if (!backup) throw new Error('Agent backup was not recorded')
        return backup
      } catch (error) {
        await fileStore.delete(storagePath).catch(() => undefined)
        throw error
      }
    },

    async getArchive(organizationId, channelId, backupId) {
      const [record] = await db
        .select({
          id: agentBackups.id,
          channelId: agentBackups.channelId,
          fileName: agentBackups.fileName,
          storagePath: agentBackups.storagePath,
          byteSize: agentBackups.byteSize,
          createdAt: agentBackups.createdAt,
        })
        .from(agentBackups)
        .where(
          and(
            eq(agentBackups.id, backupId),
            eq(agentBackups.organizationId, organizationId),
            eq(agentBackups.channelId, channelId),
          ),
        )
        .limit(1)
      if (!record) return null

      const stored = await fileStore.get(record.storagePath)
      if (!stored) return null

      return {
        backup: {
          id: record.id,
          channelId: record.channelId,
          fileName: record.fileName,
          byteSize: record.byteSize,
          createdAt: record.createdAt,
        },
        archive: stored.body,
      }
    },

    async deleteStoredFiles(storagePaths) {
      await Promise.all(storagePaths.map((path) => fileStore.delete(path)))
    },
  }
}

function backupStoragePath(organizationId: string, channelId: number): string {
  const organizationKey = createHash('sha256')
    .update(organizationId)
    .digest('hex')
    .slice(0, 24)
  return `agent-backups/${organizationKey}/${channelId}/${randomUUID()}.agtx`
}

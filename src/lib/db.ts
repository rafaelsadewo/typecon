import { PrismaClient } from '@prisma/client'

// reuse one client across hot reloads in dev
const g = globalThis as unknown as { db?: PrismaClient }
export const db = g.db ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') g.db = db

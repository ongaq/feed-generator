import SqliteDb from 'better-sqlite3'
import { Kysely, Migrator, SqliteDialect, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

export const createDb = (location: string): Database => {
  // PostgreSQL接続文字列（DATABASE_URLが設定されている場合）
  if (process.env.DATABASE_URL) {
    console.log('Using PostgreSQL database')
    return new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        }),
      }),
    })
  }
  
  // SQLite（開発環境用）
  console.log('Using SQLite database:', location)
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: new SqliteDb(location),
    }),
  })
}

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

export type Database = Kysely<DatabaseSchema>

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
  
  // SQLite（本番環境で使用）
  console.log('Using SQLite database:', location)
  const sqliteDb = new SqliteDb(location)

  // WALモード: 読み取りと書き込みの同時実行を可能にする
  sqliteDb.pragma('journal_mode = WAL')

  // メモリ使用量制限のための追加設定
  // cache_size: ページキャッシュサイズ（負の値はKB単位、-64000 = 64MB）
  sqliteDb.pragma('cache_size = -64000')
  // mmap_size: メモリマップI/Oサイズ（128MB制限、0で無効化も可能）
  sqliteDb.pragma('mmap_size = 134217728')
  // wal_autocheckpoint: WALファイルが指定ページ数に達したら自動的にチェックポイント
  // 小さい値にすることでWALファイルの肥大化を防ぐ（デフォルト1000、500に設定）
  sqliteDb.pragma('wal_autocheckpoint = 500')
  // temp_store: 一時テーブルをメモリに保存（デフォルト）
  sqliteDb.pragma('temp_store = MEMORY')
  // synchronous: NORMAL（WAL使用時の推奨設定、パフォーマンスと安全性のバランス）
  sqliteDb.pragma('synchronous = NORMAL')

  console.log('SQLite PRAGMA settings applied for memory optimization')

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: sqliteDb,
    }),
  })
}

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

export type Database = Kysely<DatabaseSchema>

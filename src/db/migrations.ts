import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('cid', 'varchar(255)', (col) => col.notNull())
      .addColumn('text', 'text', (col) => col.notNull())
      .addColumn('replyParent', 'varchar(255)')
      .addColumn('replyRoot', 'varchar(255)')
      .addColumn('indexedAt', 'varchar(255)', (col) => col.notNull())
      .execute()
    
    // PostgreSQL用のインデックス
    await db.schema
      .createIndex('idx_post_indexed_at')
      .on('post')
      .column('indexedAt')
      .execute()
      
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('cursor', 'bigint', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('user_stats')
      .addColumn('userHash', 'varchar(32)', (col) => col.primaryKey())
      .addColumn('gameRatio', 'smallint', (col) => col.notNull().defaultTo(0))
      .addColumn('postCount', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('gamePlayer', 'smallint', (col) => col.notNull().defaultTo(0))
      .addColumn('lastUpdate', 'bigint', (col) => col.notNull())
      .addColumn('createdAt', 'bigint', (col) => col.notNull())
      .execute()
    
    // パフォーマンス用インデックス
    await db.schema
      .createIndex('idx_user_stats_last_update')
      .on('user_stats')
      .column('lastUpdate')
      .execute()
    
    await db.schema
      .createIndex('idx_user_stats_game_player')
      .on('user_stats')
      .column('gamePlayer')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('user_stats').execute()
  },
}

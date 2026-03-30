/**
 * PostgreSQL → SQLite 移行スクリプト
 *
 * 使い方:
 *   DATABASE_URL=postgres://... ts-node scripts/migrate-to-sqlite.ts
 *
 * 出力:
 *   - data/user_stats.sql  (user_statsテーブルのINSERT文)
 *   - data/posts.sql       (postテーブルのINSERT文)
 */

import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 環境変数が設定されていません')
  console.error('使い方: DATABASE_URL=postgres://... ts-node scripts/migrate-to-sqlite.ts')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

const outputDir = path.join(__dirname, '..', 'data')

// SQLiteのINSERT文をエスケープ
function escapeValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  // 文字列をエスケープ（シングルクォートを二重に）
  const escaped = String(value).replace(/'/g, "''")
  return `'${escaped}'`
}

async function exportUserStats(): Promise<number> {
  console.log('📊 user_stats テーブルをエクスポート中...')

  const result = await pool.query('SELECT * FROM user_stats')
  const rows = result.rows

  if (rows.length === 0) {
    console.log('  → user_stats: 0件')
    return 0
  }

  const statements: string[] = []
  statements.push('-- user_stats テーブル移行データ')
  statements.push(`-- エクスポート日時: ${new Date().toISOString()}`)
  statements.push(`-- 件数: ${rows.length}`)
  statements.push('')
  statements.push('BEGIN TRANSACTION;')
  statements.push('')

  for (const row of rows) {
    const values = [
      escapeValue(row.userHash || row.userhash),
      escapeValue(row.gameRatio || row.gameratio || 0),
      escapeValue(row.postCount || row.postcount || 0),
      escapeValue(row.gamePlayer || row.gameplayer || 0),
      escapeValue(row.lastUpdate || row.lastupdate || 0),
      escapeValue(row.createdAt || row.createdat || 0)
    ].join(', ')

    statements.push(
      `INSERT OR REPLACE INTO user_stats (userHash, gameRatio, postCount, gamePlayer, lastUpdate, createdAt) VALUES (${values});`
    )
  }

  statements.push('')
  statements.push('COMMIT;')

  const outputPath = path.join(outputDir, 'user_stats.sql')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, statements.join('\n'))

  console.log(`  → user_stats: ${rows.length}件 → ${outputPath}`)
  return rows.length
}

async function exportPosts(): Promise<number> {
  console.log('📝 post テーブルをエクスポート中...')

  const result = await pool.query('SELECT * FROM post ORDER BY "indexedAt" DESC LIMIT 10000')
  const rows = result.rows

  if (rows.length === 0) {
    console.log('  → post: 0件')
    return 0
  }

  const statements: string[] = []
  statements.push('-- post テーブル移行データ')
  statements.push(`-- エクスポート日時: ${new Date().toISOString()}`)
  statements.push(`-- 件数: ${rows.length}（最新10000件）`)
  statements.push('')
  statements.push('BEGIN TRANSACTION;')
  statements.push('')

  for (const row of rows) {
    const values = [
      escapeValue(row.uri),
      escapeValue(row.cid),
      escapeValue(row.text),
      escapeValue(row.replyParent || row.replyparent),
      escapeValue(row.replyRoot || row.replyroot),
      escapeValue(row.indexedAt || row.indexedat)
    ].join(', ')

    statements.push(
      `INSERT OR IGNORE INTO post (uri, cid, text, replyParent, replyRoot, indexedAt) VALUES (${values});`
    )
  }

  statements.push('')
  statements.push('COMMIT;')

  const outputPath = path.join(outputDir, 'posts.sql')
  fs.writeFileSync(outputPath, statements.join('\n'))

  console.log(`  → post: ${rows.length}件 → ${outputPath}`)
  return rows.length
}

async function main() {
  console.log('🚀 PostgreSQL → SQLite 移行スクリプト')
  console.log('====================================')
  console.log('')

  try {
    // 接続テスト
    await pool.query('SELECT 1')
    console.log('✅ PostgreSQLに接続しました')
    console.log('')

    const userStatsCount = await exportUserStats()
    const postsCount = await exportPosts()

    console.log('')
    console.log('====================================')
    console.log('✅ エクスポート完了!')
    console.log('')
    console.log('次のステップ:')
    console.log('1. SQLファイルをFly.ioにアップロード:')
    console.log('   fly ssh sftp shell -a feed-generator-old-smoke-7764')
    console.log('   > put data/user_stats.sql /data/')
    console.log('   > put data/posts.sql /data/')
    console.log('')
    console.log('2. SQLiteにインポート:')
    console.log('   fly ssh console -a feed-generator-old-smoke-7764')
    console.log('   # sqlite3 /data/feed.db < /data/user_stats.sql')
    console.log('   # sqlite3 /data/feed.db < /data/posts.sql')
    console.log('')

  } catch (error) {
    console.error('❌ エラー:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()

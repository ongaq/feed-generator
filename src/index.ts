import dotenv from 'dotenv'
import FeedGenerator from './server'
import { getUserHistory } from './util/user-history'
import fs from 'fs'
import path from 'path'

const run = async () => {
  dotenv.config()
  
  // SQLiteファイル用ディレクトリを確実に作成
  const sqliteLocation = maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? './data/feed.db';
  const sqliteDir = path.dirname(sqliteLocation);
  
  try {
    if (!fs.existsSync(sqliteDir)) {
      fs.mkdirSync(sqliteDir, { recursive: true });
      console.log(`Created directory: ${sqliteDir}`);
    }
  } catch (error) {
    console.error(`Failed to create directory ${sqliteDir}:`, error);
    process.exit(1);
  }

  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  const server = FeedGenerator.create({
    port: maybeInt(process.env.PORT) ?? maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? 'localhost',
    sqliteLocation: sqliteLocation,
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.network',
    publisherDid:
      maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? 'did:example:alice',
    subscriptionReconnectDelay:
      maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    hostname,
    serviceDid,
  })
  await server.start()
  console.log(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )

  // メモリ監視（5分ごと）
  const MEMORY_CHECK_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const userHistoryStats = getUserHistory().getStats();

    console.log(`[Memory] heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB, ` +
      `rss: ${Math.round(memUsage.rss / 1024 / 1024)}MB, ` +
      `userHistory: cache=${userHistoryStats.hotCacheUsers}, queue=${userHistoryStats.syncQueueUsers} (${userHistoryStats.queueUtilization}%), ` +
      `syncFails=${userHistoryStats.syncFailCount}`);

    // メモリ使用量が高い場合は警告
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 800) {
      const message = `[Memory Warning] High memory usage: ${Math.round(heapUsedMB)}MB - consider investigating`;
      console.warn(message);

      // Discord Webhookに通知
      fetch('https://discord.com/api/webhooks/1488863692542972154/2OJbpXqjmIeBZYtt_IOPZIESirjAXBuQ8x5v0RUezfM6DdEDbT5uvl2SkJVYfPGeD37A', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `⚠️ **Feed Generator Memory Alert**\n${message}\n` +
            `heap: ${Math.round(heapUsedMB)}MB, rss: ${Math.round(memUsage.rss / 1024 / 1024)}MB\n` +
            `userHistory: cache=${userHistoryStats.hotCacheUsers}, queue=${userHistoryStats.syncQueueUsers} (${userHistoryStats.queueUtilization}%)`
        })
      }).catch(err => console.error('Discord webhook failed:', err.message));
    }
  }, MEMORY_CHECK_INTERVAL);

  // Graceful shutdown: Herokuデプロイ時のデータ保護
  const gracefulShutdown = async (signal: string) => {
    console.log(`${signal} received, starting graceful shutdown...`)
    
    try {
      // ユーザー履歴をDBに強制同期（最重要）
      console.log('Syncing user history to database...')
      await getUserHistory().forceSync()
      console.log('User history sync completed')
      
      // サーバー停止
      console.log('Stopping server...')
      await server.stop()
      console.log('Server stopped')
      
    } catch (error) {
      console.error('Error during graceful shutdown:', error)
    } finally {
      console.log('Graceful shutdown completed')
      process.exit(0)
    }
  }

  // SIGTERM: Herokuデプロイ時に送信される (30秒の猶予あり)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  
  // SIGINT: Ctrl+C等での手動停止時
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()

import dotenv from 'dotenv'
import FeedGenerator from './server'
import { getUserHistory } from './util/user-history'

const run = async () => {
  dotenv.config()
  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  const server = FeedGenerator.create({
    port: maybeInt(process.env.PORT) ?? maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? 'localhost',
    sqliteLocation: maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? './data/feed.db',
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

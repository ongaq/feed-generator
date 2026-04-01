import crypto from 'crypto';
import { Database } from '../db';

// メモリ効率を最大化するために最小限のデータ構造を使用
interface UserStats {
  r: number;  // ratio (0-255の整数で0-1.0を表現)
  c: number;  // count (投稿数)
  t: number;  // timestamp (last update)
  g: number;  // gamePlayer flag (0=unknown, 1=confirmed gamer)
}

export class UserHistoryManager {
  private hotCache = new Map<string, UserStats>();    // ホットキャッシュ（頻繁アクセス）
  private readonly HOT_CACHE_SIZE = 5000;             // 5K users ≈ 140KB
  private readonly SYNC_QUEUE_MAX_SIZE = 10000;       // syncQueueの上限（メモリリーク防止）
  private readonly SALT = process.env.USER_HASH_SALT || 'default_salt_2024';
  private db: Database;

  // DB同期用
  private syncQueue = new Map<string, UserStats>();   // 同期待ちデータ
  private lastSync = Date.now();
  private readonly SYNC_INTERVAL = 30000;             // 30秒ごとにDB同期
  private syncFailCount = 0;                          // 連続同期失敗カウント

  constructor(database: Database) {
    this.db = database;
    
    // 定期同期の開始
    setInterval(() => {
      this.syncToDatabase();
    }, this.SYNC_INTERVAL);
  }

  /**
   * ユーザーDIDをハッシュ化（プライバシー保護 + メモリ節約）
   */
  private hashDid(did: string): string {
    return crypto.createHash('sha256')
      .update(did + this.SALT)
      .digest('hex')
      .slice(0, 16); // 16文字（8バイト）に短縮
  }

  /**
   * 0-1.0の値を0-255の整数に変換してメモリ節約
   */
  private encodeRatio(ratio: number): number {
    return Math.round(Math.min(Math.max(ratio, 0), 1) * 255);
  }

  /**
   * 0-255の整数を0-1.0の値に復元
   */
  private decodeRatio(encoded: number): number {
    return encoded / 255;
  }

  /**
   * ユーザーの投稿を記録（指数移動平均で更新）
   */
  updateUserPost(did: string, isGamePost: boolean, isStrongGamePost: boolean = false): void {
    const hash = this.hashDid(did);
    const now = Date.now();
    
    let existing = this.hotCache.get(hash);
    
    if (existing) {
      // 既存ユーザー: 指数移動平均で更新（α=0.15）
      const currentRatio = this.decodeRatio(existing.r);
      const newRatio = currentRatio * 0.85 + (isGamePost ? 1 : 0) * 0.15;
      
      existing.r = this.encodeRatio(newRatio);
      existing.c = Math.min(existing.c + 1, 65535); // uint16の上限
      existing.t = now;
      
      // strongGamePost を一度でも投稿したユーザーは確実なゲーマーとしてマーク
      if (isStrongGamePost) {
        existing.g = 1;
      }
    } else {
      // 新規ユーザー
      existing = {
        r: this.encodeRatio(isGamePost ? 1 : 0),
        c: 1,
        t: now,
        g: isStrongGamePost ? 1 : 0
      };
      this.hotCache.set(hash, existing);
    }

    // 同期キューに追加（サイズ制限チェック）
    if (this.syncQueue.size < this.SYNC_QUEUE_MAX_SIZE) {
      this.syncQueue.set(hash, { ...existing });
    } else if (this.syncQueue.size % 1000 === 0) {
      // 上限に達している場合は警告（頻繁に出力しないよう制限）
      console.warn(`syncQueue at max capacity (${this.SYNC_QUEUE_MAX_SIZE}), dropping updates`);
    }

    // ホットキャッシュのサイズ管理
    if (this.hotCache.size > this.HOT_CACHE_SIZE) {
      this.pruneHotCache();
    }
  }

  /**
   * ユーザーのゲーム関連度を取得（非同期）
   */
  async getUserGameConfidence(did: string): Promise<number> {
    const hash = this.hashDid(did);
    
    // まずホットキャッシュを確認
    let stats = this.hotCache.get(hash);
    
    if (!stats) {
      // DBから取得
      stats = await this.loadFromDatabase(hash);

      if (stats) {
        // ホットキャッシュに追加
        this.addToHotCache(hash, stats);
      }
    }
    
    if (!stats) return 0;

    // 確実なゲーマーフラグが立っている場合は常に高信頼度
    if (stats.g === 1) return 0.95;

    const ratio = this.decodeRatio(stats.r);
    const postCount = stats.c;
    
    // 投稿数が少ない場合は信頼度を下げる
    if (postCount < 3) return ratio * 0.3;
    if (postCount < 10) return ratio * 0.6;
    
    return ratio;
  }

  /**
   * ユーザーが確実なゲーマーかどうかを判定（非同期）
   */
  async isConfirmedGamer(did: string): Promise<boolean> {
    const hash = this.hashDid(did);
    
    // まずホットキャッシュを確認
    let stats = this.hotCache.get(hash);
    
    if (!stats) {
      // DBから取得
      stats = await this.loadFromDatabase(hash);
      if (stats) {
        // ホットキャッシュに追加
        this.addToHotCache(hash, stats);
      }
    }
    
    return stats?.g === 1 || false;
  }

  /**
   * DBからユーザー統計を読み込み
   */
  private async loadFromDatabase(hash: string): Promise<UserStats | undefined> {
    try {
      const result = await this.db
        .selectFrom('user_stats')
        .where('userHash', '=', hash)
        .select([
          'gameRatio',
          'postCount', 
          'lastUpdate',
          'gamePlayer'
        ])
        .executeTakeFirst();

      if (!result) return undefined;

      return {
        r: result.gameRatio,
        c: result.postCount,
        t: result.lastUpdate,
        g: result.gamePlayer
      };
    } catch (error) {
      console.error('Error loading user stats from DB:', error);
      return undefined;
    }
  }

  /**
   * ホットキャッシュに追加（LRU管理）
   */
  private addToHotCache(hash: string, stats: UserStats): void {
    // サイズ制限チェック
    if (this.hotCache.size >= this.HOT_CACHE_SIZE) {
      this.pruneHotCache();
    }
    
    this.hotCache.set(hash, stats);
  }

  /**
   * ホットキャッシュのサイズ削減（LRU・メモリ効率化版）
   * 完全な配列コピーを避け、削除対象のみを収集
   */
  private pruneHotCache(): void {
    const deleteCount = Math.floor(this.hotCache.size * 0.25);
    if (deleteCount === 0) return;

    // 削除対象のタイムスタンプ閾値を計算
    // まず最小ヒープ的に古いエントリを探す
    const candidates: Array<{ key: string; t: number }> = [];

    for (const [key, stats] of this.hotCache) {
      if (candidates.length < deleteCount) {
        candidates.push({ key, t: stats.t });
        // 挿入ソート（小さい配列なので効率的）
        for (let i = candidates.length - 1; i > 0 && candidates[i].t > candidates[i - 1].t; i--) {
          [candidates[i], candidates[i - 1]] = [candidates[i - 1], candidates[i]];
        }
      } else if (stats.t < candidates[0].t) {
        // 現在の最大より古い場合、最大を置き換え
        candidates[0] = { key, t: stats.t };
        // 再度ソート
        for (let i = 0; i < candidates.length - 1 && candidates[i].t > candidates[i + 1].t; i++) {
          [candidates[i], candidates[i + 1]] = [candidates[i + 1], candidates[i]];
        }
      }
    }

    // 古いエントリを削除
    for (const { key } of candidates) {
      this.hotCache.delete(key);
    }
  }

  /**
   * 同期キューのデータをDBに書き込み（バッチ処理最適化）
   */
  private async syncToDatabase(): Promise<void> {
    if (this.syncQueue.size === 0) return;

    const now = Date.now();
    const toSync = Array.from(this.syncQueue.entries());
    this.syncQueue.clear();

    // バッチサイズ（SQLiteの変数制限を考慮）
    const BATCH_SIZE = 100;

    try {
      // バッチ処理でDB更新
      for (let i = 0; i < toSync.length; i += BATCH_SIZE) {
        const batch = toSync.slice(i, i + BATCH_SIZE);
        const values = batch.map(([hash, stats]) => ({
          userHash: hash,
          gameRatio: stats.r,
          postCount: stats.c,
          gamePlayer: stats.g,
          lastUpdate: stats.t,
          createdAt: now
        }));

        // Kysely 0.22のバッチupsertは複数の値に対して個別に実行が必要
        for (const value of values) {
          await this.db
            .insertInto('user_stats')
            .values(value)
            .onConflict((oc) => oc
              .column('userHash')
              .doUpdateSet({
                gameRatio: value.gameRatio,
                postCount: value.postCount,
                gamePlayer: value.gamePlayer,
                lastUpdate: value.lastUpdate
              })
            )
            .execute();
        }
      }

      this.lastSync = now;
      this.syncFailCount = 0; // 成功時にリセット

      if (process.env.NODE_ENV === 'development') {
        console.log(`Synced ${toSync.length} user stats to DB in ${Math.ceil(toSync.length / BATCH_SIZE)} batches`);
      }
    } catch (error) {
      this.syncFailCount++;
      console.error(`Error syncing user stats to DB (fail count: ${this.syncFailCount}):`, error);

      // 連続失敗が多い場合はデータを破棄（メモリリーク防止）
      if (this.syncFailCount >= 5) {
        console.error('Too many sync failures, discarding sync queue to prevent memory leak');
        this.syncFailCount = 0;
        return; // データを戻さない
      }

      // エラー時は同期キューに戻す（サイズ制限を尊重）
      for (const [hash, stats] of toSync) {
        if (this.syncQueue.size >= this.SYNC_QUEUE_MAX_SIZE) break;
        this.syncQueue.set(hash, stats);
      }
    }
  }

  /**
   * 統計情報を取得（監視用）
   */
  getStats() {
    const hotCacheUsers = this.hotCache.size;
    const syncQueueUsers = this.syncQueue.size;
    const estimatedMemory = (hotCacheUsers + syncQueueUsers) * 28; // bytes (より正確な見積もり: 16 hash + 12 stats)

    return {
      hotCacheUsers,
      syncQueueUsers,
      estimatedMemoryKB: Math.round(estimatedMemory / 1024),
      estimatedMemoryMB: Math.round(estimatedMemory / 1024 / 1024 * 100) / 100,
      lastSyncAgo: Math.round((Date.now() - this.lastSync) / 1000), // 秒
      syncFailCount: this.syncFailCount,
      queueUtilization: Math.round((syncQueueUsers / this.SYNC_QUEUE_MAX_SIZE) * 100) // %
    };
  }

  /**
   * 手動でキャッシュをクリア（緊急時用）
   */
  clear(): void {
    this.hotCache.clear();
    this.syncQueue.clear();
  }

  /**
   * 強制同期：即座にすべてのデータをDBに保存
   */
  async forceSync(): Promise<void> {
    try {
      console.log('UserHistoryManager: Force syncing all data to database...');
      
      // すべてのホットキャッシュデータを同期キューに追加
      for (const [hash, stats] of this.hotCache) {
        this.syncQueue.set(hash, stats);
      }
      
      // 即座に同期実行
      await this.syncToDatabase();
      
      console.log(`UserHistoryManager: Force sync completed (${this.hotCache.size} users)`);
    } catch (error) {
      console.error('UserHistoryManager: Error during force sync:', error);
      throw error; // 上位で処理できるようにエラーを再throw
    }
  }

  /**
   * アプリ終了時の最終同期
   */
  async shutdown(): Promise<void> {
    console.log('UserHistoryManager: Final sync before shutdown...');
    await this.forceSync();
  }
}

// シングルトンインスタンス（DBインスタンスが必要なので後で初期化）
let userHistory: UserHistoryManager;

export function initUserHistory(database: Database): UserHistoryManager {
  if (!userHistory) {
    userHistory = new UserHistoryManager(database);
  }
  return userHistory;
}

export function getUserHistory(): UserHistoryManager {
  if (!userHistory) {
    throw new Error('UserHistory not initialized. Call initUserHistory() first.');
  }
  return userHistory;
}
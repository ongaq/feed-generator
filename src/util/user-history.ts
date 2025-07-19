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
  private readonly SALT = process.env.USER_HASH_SALT || 'default_salt_2024';
  private db: Database;
  
  // DB同期用
  private syncQueue = new Map<string, UserStats>();   // 同期待ちデータ
  private lastSync = Date.now();
  private readonly SYNC_INTERVAL = 30000;             // 30秒ごとにDB同期

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

    // 同期キューに追加
    this.syncQueue.set(hash, { ...existing });

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
   * ホットキャッシュのサイズ削減（LRU）
   */
  private pruneHotCache(): void {
    const entries = Array.from(this.hotCache.entries());
    
    // 古い順でソート
    entries.sort((a, b) => a[1].t - b[1].t);
    
    // 古い25%を削除
    const deleteCount = Math.floor(entries.length * 0.25);
    for (let i = 0; i < deleteCount; i++) {
      this.hotCache.delete(entries[i][0]);
    }
  }

  /**
   * 同期キューのデータをDBに書き込み
   */
  private async syncToDatabase(): Promise<void> {
    if (this.syncQueue.size === 0) return;

    const now = Date.now();
    const toSync = Array.from(this.syncQueue.entries());
    this.syncQueue.clear();

    try {
      // バッチ処理でDB更新
      for (const [hash, stats] of toSync) {
        await this.db
          .insertInto('user_stats')
          .values({
            userHash: hash,
            gameRatio: stats.r,
            postCount: stats.c,
            gamePlayer: stats.g,
            lastUpdate: stats.t,
            createdAt: now
          })
          .onConflict((oc) => oc
            .column('userHash')
            .doUpdateSet({
              gameRatio: stats.r,
              postCount: stats.c,
              gamePlayer: stats.g,
              lastUpdate: stats.t
            })
          )
          .execute();
      }

      this.lastSync = now;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`Synced ${toSync.length} user stats to DB`);
      }
    } catch (error) {
      console.error('Error syncing user stats to DB:', error);
      
      // エラー時は同期キューに戻す
      toSync.forEach(([hash, stats]) => {
        this.syncQueue.set(hash, stats);
      });
    }
  }

  /**
   * 統計情報を取得（監視用）
   */
  getStats() {
    const hotCacheUsers = this.hotCache.size;
    const syncQueueUsers = this.syncQueue.size;
    const estimatedMemory = (hotCacheUsers + syncQueueUsers) * 13; // bytes (13 bytes per user in new structure)
    
    return {
      hotCacheUsers,
      syncQueueUsers,
      estimatedMemoryKB: Math.round(estimatedMemory / 1024),
      estimatedMemoryMB: Math.round(estimatedMemory / 1024 / 1024 * 100) / 100
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
   * アプリ終了時の最終同期
   */
  async shutdown(): Promise<void> {
    console.log('UserHistoryManager: Final sync before shutdown...');
    await this.syncToDatabase();
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
import crypto from 'crypto';

// メモリ効率を最大化するために最小限のデータ構造を使用
interface UserStats {
  r: number;  // ratio (0-255の整数で0-1.0を表現)
  c: number;  // count (投稿数)
  t: number;  // timestamp (last update)
  g: number;  // gamePlayer flag (0=unknown, 1=confirmed gamer)
}

export class UserHistoryManager {
  private cache = new Map<string, UserStats>();
  private readonly MAX_USERS = 20000;  // 最大20K ユーザー（約560KB）
  private readonly CLEANUP_THRESHOLD = 22000;  // クリーンアップ開始しきい値
  private readonly SALT = process.env.USER_HASH_SALT || 'default_salt_2024';
  
  // メモリ使用量監視用
  private lastCleanup = Date.now();
  private readonly CLEANUP_INTERVAL = 3600000; // 1時間

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
    
    const existing = this.cache.get(hash);
    
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
      this.cache.set(hash, {
        r: this.encodeRatio(isGamePost ? 1 : 0),
        c: 1,
        t: now,
        g: isStrongGamePost ? 1 : 0
      });
    }

    // 定期的なメモリクリーンアップ
    if (this.cache.size > this.CLEANUP_THRESHOLD || 
        (now - this.lastCleanup) > this.CLEANUP_INTERVAL) {
      this.cleanup();
    }
  }

  /**
   * ユーザーのゲーム関連度を取得
   */
  getUserGameConfidence(did: string): number {
    const hash = this.hashDid(did);
    const stats = this.cache.get(hash);
    
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
   * ユーザーが確実なゲーマーかどうかを判定
   */
  isConfirmedGamer(did: string): boolean {
    const hash = this.hashDid(did);
    const stats = this.cache.get(hash);
    return stats?.g === 1 || false;
  }

  /**
   * メモリクリーンアップ（古いデータと低活動ユーザーを削除）
   */
  private cleanup(): void {
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 3600000;
    const entries = Array.from(this.cache.entries());
    
    // 古いエントリと低信頼度エントリを削除
    const toDelete: string[] = [];
    
    for (const [hash, stats] of entries) {
      const age = now - stats.t;
      const ratio = this.decodeRatio(stats.r);
      
      // 削除条件
      if (age > ONE_WEEK ||                           // 1週間以上古い
          (stats.c < 3 && ratio < 0.1) ||            // 投稿少なく関連度低い
          (age > 86400000 && ratio < 0.05)) {        // 1日以上古く極低関連度
        toDelete.push(hash);
      }
    }

    // 削除実行
    toDelete.forEach(hash => this.cache.delete(hash));

    // まだサイズが大きい場合は、さらに古いエントリを削除
    if (this.cache.size > this.MAX_USERS) {
      const sortedEntries = entries
        .sort((a, b) => a[1].t - b[1].t) // 古い順
        .slice(0, this.cache.size - this.MAX_USERS);
      
      sortedEntries.forEach(([hash]) => this.cache.delete(hash));
    }

    this.lastCleanup = now;
    
    // メモリ使用量をログ出力（開発時のデバッグ用）
    if (process.env.NODE_ENV === 'development') {
      const estimatedMemory = this.cache.size * 28; // bytes
      console.log(`UserHistory cleanup: ${this.cache.size} users, ~${Math.round(estimatedMemory/1024)}KB`);
    }
  }

  /**
   * 統計情報を取得（監視用）
   */
  getStats() {
    const totalUsers = this.cache.size;
    const estimatedMemory = totalUsers * 28; // bytes
    
    return {
      totalUsers,
      estimatedMemoryKB: Math.round(estimatedMemory / 1024),
      estimatedMemoryMB: Math.round(estimatedMemory / 1024 / 1024 * 100) / 100
    };
  }

  /**
   * 手動でキャッシュをクリア（緊急時用）
   */
  clear(): void {
    this.cache.clear();
    this.lastCleanup = Date.now();
  }
}

// シングルトンインスタンス
export const userHistory = new UserHistoryManager();
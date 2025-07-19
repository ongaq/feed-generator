export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  user_stats: UserStats
}

export type Post = {
  uri: string
  cid: string
  text: string
  replyParent: string | null
  replyRoot: string | null
  indexedAt: string
}

export type SubState = {
  service: string
  cursor: number
}

export type UserStats = {
  userHash: string     // プライマリキー：ハッシュ化されたDID
  gameRatio: number    // 0-255: ゲーム投稿比率
  postCount: number    // 投稿数
  gamePlayer: number   // 0 or 1: 確実なゲーマーフラグ
  lastUpdate: number   // タイムスタンプ
  createdAt: number    // 作成日時
}

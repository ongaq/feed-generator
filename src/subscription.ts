import type { Post } from './db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'

const matchPatterns = [
  '崩壊スターレイル', '崩スタ', 'スタレ', 'スターレイル', '(ho(n|u)kai:?\\s?)?star\\s?rail',
  'Penacony', 'ピノコニー', '仙舟', '羅浮', 'ヤリーロ',
  '天才クラブ', 'スクリューガム', 'ポルカ(・)?カカム', 'セセルカル', 'イリアスサラス', 'ヘルタ', '原始博士', '余清塗', '柏環',
  '星穹列車', '星核ハンター', '絶滅大君', '巡海レンジャー', '反物質レギオン', '博識学会', '建創者',
  '焼却人', '虚構歴史学者', '純美の騎士団', '仮面の愚者', '弔伶人', 'ガーデン\\s?オブ\\s?リコレクション',
  'スターピースカンパニー', 'アナイアレイトギャング', 'ナナシビト', '次元プーマン',
  '魔陰の身', '雲騎軍', '持明族', '天舶司', '冥火大公', 'アフリート',
  '遺物', '光円錐', '模擬宇宙', '黄金と機械', '宇宙の蝗害', '凝結虚影', '歴戦余韻', '侵蝕トンネル', '疑似花萼', '虚構叙事', '忘却の庭', '混沌の記憶',
  '(ホテル)?(・)?レバリー', 'ナイトメアテレビ局',
  // 台詞
  'ルールは破るためにある',
  // キャラ名
  '桂乃芬', '彦卿', '鏡流', 'スヴァローグ', 'ル(ア|ァ)ン(・)?メ(ェ)?イ', '三月なのか', '停雲', 'ブラックスワン',
  '丹恒', '(丹恒(・)?)?飲月', '(Dr\\.)?レイシオ', 'アベンチュリン', '符玄', '素裳', '寒鴉', '景元', '銀狼', '青雀',
  '雪衣', 'ブローニャ', 'ジェパード', 'カカリア', 'アルジェンティ',
  // 汎用的なキャラ名なのでハッシュタグ付きのみ
  '#(hsr|姫子|トパーズ(＆カブ)?|アスター|フック|ペラ|ミーシャ|白露|カフカ|セーバル|アーラン|刃|フォフォ|サンポ|ヴェルト|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ルカ|ホタル|花火)\\s',
  // 敬称
  '(姫子|トパーズ(＆カブ)?|アスター|フック|ミーシャ|白露|カフカ|セーバル|アーラン|刃|フォフォ|サンポ|ヴェルト|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ホタル|花火)(さん|ちゃん|くん|様)'
];
const excludePatterns = [
  '#東方',
  '聖遺物',
  'act\\.hoyoverse\\.com\\/sr\\/event',
  'グラブル',
  '^(?!.*デイリークエスト).*リーク.*',
  'ヘルタイド',
  'ヘルタースケルター',
  'ベルリン',
  'インスタレーション',
  'dlsite\\.com',
  'dmm\\.co\\.jp',
];
const regExp = new RegExp(matchPatterns.join('|'), 'ig');
const excludeRegExp = new RegExp(excludePatterns.join('|'), 'igs');

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    let postsToCreate: Post[] = [];

    for (let i = 0, len = ops.posts.creates.length; i < len; i++) {
      const create = ops.posts.creates[i]
      const text = create.record.text
      const hasReply = typeof create.record.reply !== 'undefined' || /^@/.test(text);

      if (regExp.test(text) && !excludeRegExp.test(text) && !hasReply) {
        postsToCreate.push({
          uri: create.uri,
          cid: create.cid,
          text: create.record.text,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        });
      }
    }

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}

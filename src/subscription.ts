import type { Post } from './db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'

const matchPatterns = [
  '崩壊スターレイル', '崩スタ', 'スタレ', 'スターレイル', '(ho(n|u)kai:?\\s?)?star\\s?rail',
  'Penacony', 'ピノコニー', '仙舟', '羅浮', 'ヤリーロ',
  '天才クラブ', 'スクリューガム', 'ポルカ(・)?カカム', 'セセルカル', 'イリアスサラス', '原始博士', '余清塗', '柏環',
  '星穹列車', '星核ハンター', '絶滅大君', '巡海レンジャー', '反物質レギオン', '博識学会', '建創者',
  '焼却人', '虚構歴史学者', '純美の騎士団', '仮面の愚者', '弔伶人', 'ガーデン\\s?オブ\\s?リコレクション',
  'スターピースカンパニー', 'アナイアレイトギャング', 'ナナシビト', '次元プーマン', 'アキヴィリ', '星軌チケット',
  '魔陰の身', '雲騎軍', '持明族', '天舶司', '冥火大公', 'アフリート',
  '光円錐', '模擬宇宙', '黄金と機械', '宇宙の蝗害', '凝結虚影', '歴戦余韻', '侵蝕トンネル', '疑似花萼', '虚構叙事', '忘却の庭', '混沌の記憶',
  // v2.0キーワード
  '(ホテル)?(・)?レバリー', 'ナイトメアテレビ局',
  // v2.1キーワード
  '深淵への狂走', 'クラークフィルムランド', '朝露の館', '杯の中の逸話', '戦意の潮', '開拓伝説', '星間旅行スゴロク',
  // 台詞
  'ルールは破るためにある',
  // キャラ名
  '桂乃芬', '彦卿', '鏡流', 'スヴァローグ', 'ル(ア|ァ)ン(・)?メ(ェ)?イ', '三月なのか', '停雲', 'ブラックスワン',
  '丹恒', '(丹恒(・)?)?飲月', '(Dr\\.)?レイシオ', 'アベンチュリン', '符玄', '素裳', '寒鴉', '景元', '銀狼', '青雀',
  '雪衣', 'ブローニャ', 'ジェパード', 'カカリア', 'アルジェンティ', 'ギャラガー', 'ブートヒル',
  // 前後のカタカナと中黒除外、前方の漢字除外
  '(?<![ァ-ヶー・\p{Han}])(カフカ|ヘルタ|ロビン|アスター|フォフォ|ヴェルト|セーバル|アーラン)(?![ァ-ヶー・])',
  // 汎用的なキャラ名はハッシュタグ付きのみ
  '#(hsr|姫子|トパーズ(＆カブ)?|フック|ペラ|ミーシャ|白露|カフカ|刃|サンポ|ヴェルト|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ルカ|ホタル|花火)\\s',
  // 敬称
  '(姫子|トパーズ(＆カブ)?|フック|ミーシャ|白露|刃|サンポ|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ホタル|花火)(さん|ちゃん|くん|様)'
];
const excludePatterns = [
  '花火大会',
  '#東方',
  'act\\.hoyoverse\\.com\\/sr\\/event',
  'グラブル',
  'パスタ',
  '小鳥遊',
  'ワンピース',
  'ONE(\s)?PIECE',
  'レジスタレット',
  'スタレビ',
  'インスタレーション',
  '海辺のカフカ',
  '(シシド|フランツ)(・)?カフカ',
  '^(?!.*デイリークエスト).*リーク.*',
  'ベルリン',
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

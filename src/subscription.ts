import type { Post } from './db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'

const matchPatterns = [
  '崩壊スターレイル', '崩スタ', 'スターレイル', '(ho(n|u)kai:?\\s?)?star\\s?rail',
  'Penacony', 'ピノコニー', '仙舟', '羅浮', 'ヤリーロ',
  '天才クラブ', 'スクリューガム', 'ポルカ(・)?カカム', 'セセルカル', 'イリアスサラス', '原始博士', '余清塗', '柏環',
  '星穹列車', '星核ハンター', '絶滅大君', '巡海レンジャー', '反物質レギオン', '博識学会', '建創者',
  '焼却人', '虚構歴史学者', '純美の騎士団', '仮面の愚者', '弔伶人', 'ガーデン\\s?オブ\\s?リコレクション',
  'スターピースカンパニー', 'アナイアレイトギャング', 'ナナシビト', '次元プーマン', 'アキヴィリ', '星軌チケット',
  '魔陰の身', '雲騎軍', '持明族', '天舶司', '冥火大公', 'アフリート',
  '光円錐', '模擬宇宙', '次元界分裂', '階差宇宙', '黄金と機械', '宇宙の蝗害', '凝結虚影', '歴戦余韻',
  '侵蝕トンネル', '疑似花萼', '虚構叙事', '忘却の庭', '混沌の記憶', '末日の幻影',
  // v2.0キーワード
  '(ホテル)?(・)?レバリー', 'ナイトメアテレビ局',
  // v2.1キーワード
  '深淵への狂走', 'クラークフィルムランド', '朝露の館', '杯の中の逸話', '戦意の潮', '開拓伝説', '星間旅行スゴロク',
  // v2.2キーワード
  'ハルモニア聖歌隊', '銀河打者伝説', 'ディエス(・)?ドミニ', 'クロックボーイ',
  // 台詞
  'ルールは破るためにある',
  // 星神
  'ミュトゥス', 'アキヴィリ', 'ナヌーク',
  // 遺物
  'サルソット', '死水', 'ウェンワーク', 'ツガンニヤ',
  '流雲無痕の過客', '草の穂ガンマン', '純庭教会の聖騎士', '雪の密林の狩人', '成り上がりチャンピオン', '吹雪と対峙する兵士',
  '溶岩で鍛造する火匠', '星の如く輝く天才', '雷鳴轟くバンド', '昼夜の狭間を翔ける鷹', '流星の跡を追う怪盗', '荒地で盗みを働く廃土客',
  '宝命長存の蒔者', '仮想空間を漫遊するメッセンジャー', '灰燼を燃やし尽くす大公', '深い牢獄の囚人', '死水に潜る先駆者', '夢を弄ぶ時計屋',
  '次元界オーナメント', '宇宙封印ステーション', '汎銀河商事会社', '天体階差機関', '盗賊公国タリア', '星々の競技場',
  '折れた竜骨', '蒼穹戦線グラモス', '顕世の出雲と高天の神国',
  // キャラ名
  '桂乃芬', '彦卿', '鏡流', 'スヴァローグ', 'ル(ア|ァ)ン(・)?メ(ェ)?イ', '三月なのか', '停雲', 'ブラックスワン',
  '丹恒', '(丹恒(・)?)?飲月', '(Dr\\.)?レイシオ', 'アベンチュリン', '符玄', '素裳', '寒鴉', '景元', '銀狼', '青雀',
  '雪衣', 'ブローニャ', 'ジェパード', 'カカリア', 'アルジェンティ', 'ブートヒル',
  'カカワーシャ', 'シヴォーン', 'エヴィキン(人|族)',
  // 前後のカタカナと中黒除外、前方の漢字除外
  '(?<![ァ-ヶー・\\p{sc=Han}])(スタレ|ジェイド|ギャラガー|カフカ|ヘルタ|ロビン|アスター|フォフォ|ヴェルト|セーバル|アーラン)(ママ)?(?![ァ-ヶー・])',
  // 汎用的なキャラ名はハッシュタグ付きのみ
  '#(hsr|姫子|トパーズ(＆カブ)?|フック|ペラ|ミーシャ|白露|カフカ|刃|サンポ|ヴェルト|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ルカ|ホタル|花火|黄泉)\\s',
  // 敬称
  '(姫子|トパーズ(＆カブ)?|フック|白露|刃|サンポ|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ホタル|花火|黄泉)(ママ|さん|ちゃん|くん|様)'
];
const excludePatterns = [
  'ウクライナ',
  'ミサイル',
  'アスター30',
  'ココロコネクト',
  '遠山景元',
  '刑部姫子',
  '稲葉姫子',
  '打上花火',
  '花火大会',
  'ニコ(・)?ロビン',
  'ロビンとマリアン',
  'ロビン(・)?フッド',
  'クリストファー(・)?ロビン',
  '#東方',
  'グラブル',
  '小鳥遊',
  'ワンピース',
  'ONE(\s)?PIECE',
  '海辺のカフカ',
  '少年カフカ',
  'カフカの父親',
  'カフカ(全集|短編)',
  '新潮',
  '変身',
  '怪獣8号',
  '(シシド|フランツ)(・)?カフカ',
  '^(?!.*デイリークエスト).*リーク.*',
  'ベルリン',
  'genshin-goods\\.com',
  'kusogame\\.com',
  'playing-games\\.com',
  'act\\.hoyoverse\\.com\\/sr\\/event',
  'dlsite\\.com',
  'dmm\\.co\\.jp',
  // ネガティブな単語
  '面白く(な|無)い',
  'つまらない',
  'おもんな',
  '萎え',
  '(?<![ァ-ヶー・\\p{sc=Han}])(モチベ|ﾓﾁﾍﾞ|クソゲ|ｸｿｹﾞ|キショい|ボケ|ゴミ|カス)(?![ァ-ヶー・])',
];
const regExp = new RegExp(matchPatterns.join('|'), 'igu');
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

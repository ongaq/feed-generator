import type { Post } from './db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'

const matchPatterns = [
  '崩壊スターレイル', '崩スタ', 'スターレイル', '(ho(n|u)kai:?\\s?)?star\\s?rail',
  'ピノコニー', '仙舟', '羅浮', 'ヤリーロ',
  '天才クラブ', 'スクリューガム', 'ポルカ(・)?カカム', 'セセルカル', 'イリアスサラス', '原始博士', '余清塗', '柏環',
  '星穹列車', '星核ハンター', '絶滅大君', '巡海レンジャー', '反物質レギオン', '博識学会', '建創者',
  '焼却人', '虚構歴史学者', '純美の騎士団', '仮面の愚者', '弔伶人', 'ガーデン\\s?オブ\\s?リコレクション',
  'スターピースカンパニー', 'アナイアレイトギャング', 'ナナシビト', '次元プーマン', 'アキヴィリ', '星軌チケット',
  '魔陰の身', '雲騎軍', '持明族', '龍尊', '天舶司', '冥火大公', 'アフリート', 'ウーウーボ',
  '光円錐', '模擬宇宙', '次元界分裂', '階差宇宙', '黄金と機械', '宇宙の蝗害', '凝結虚影', '歴戦余韻',
  '侵蝕トンネル', '疑似花萼', '虚構叙事', '忘却の庭', '混沌の記憶', '末日の幻影', '銀河打者', '超撃破',
  // v2.0キーワード
  '(?<![ァ-ヶー・•\\p{sc=Han}])(ホテル)?(・|•)?レバリー', 'ナイトメアテレビ局',
  // v2.1キーワード
  '深淵への狂走', 'クラークフィルムランド', '朝露の館', '杯の中の逸話', '戦意の潮', '開拓伝説', '星間旅行スゴロク',
  // v2.2キーワード
  'ハルモニア聖歌隊', 'ディエス(・)?ドミニ', 'クロックボーイ',
  // v2.3キーワード
  '朱明', '椒丘', '江戸星', '海洋惑星|ルサカ', 'アゲートの世界|メルスタイン', 'ガラス光帯', 'パトレヴィニツィア',
  '演武典礼', '飛霄', '曜青', '懐炎', '雲璃', '霊砂', '伝説の新人剣士', '焔輪八葉', 'オーナメント抽出', '(周期|通常)演算',
  '永遠の地|オンパロス', '小鳥マッチ',
  // v2.4キーワード
  '歩離人', '燼滅(軍団|禍祖)',
  // v2.5キーワード
  'バナダイス', '塵冥', '戎韜', '爻光', '玄全', '呼雷', '薩蘭', '涛然', '幽囚獄',
  // v2.6キーワード
  '折り紙大学', '折り大', 'バナ悪', 'バナーネモンキー', '毘乃昆尼末法筆録',
  'シルバーガン(・|•)?(修羅|シュラ)', 'バット(・|•)?(忍者|ニンジャ)', '(くるくる|クルクル)(・|•)?(忍者|ニンジャ)',
  '音律狩猟忍法帖', 'コールドフットマート', 'レンジャーの影', '不可知域', 'ルパート2世',
  // v2.7キーワード
  'パーティー車両', '開拓者の部屋',
  // v2.8キーワード
  'マダム(・|•)?ヘルタ',
  // v3.0キーワード？
  'アグライア', 'オクヘイマ', '遂願樹脂', '変数サイコロ', '黄金裔', 'ミュリオン', 'ニカドリー|ケファレ|ジョーリア|モネータ|オロニクス|タレンタム|ファジェイナ', '(紛争|世を背負う|大地|理性|浪漫|歳月|法|死|詭術|天空|海洋)(」)?のタイタン',
  '(キメラ|ライオン)組', 'アザラシ大作戦', 'ポポン', 'セファリア', 'ヒア丹', '丹ヒア', 'アグサフェ', 'サフェアグ', 'アグセファ', 'セファアグ',
  // v3.4キーワード
  'NeiKos496', 'PhiLia093', 'OreXis945', 'EpieiKeia216', 'SkeMma720', 'δ(-)?me13', 'カスライナ', '皇帝のセプター',
  // 音楽
  '銀河を独り揺蕩う', '傷(付|つ)く誰かの心を守る(こと|事)が(できた|出来た)なら', '翼の生えた希望',
  // 星神
  'ミュトゥス', 'アキヴィリ', 'ナヌーク',
  // 運命
  '存護|巡狩',
  '(壊滅|知恵|調和|虚無|豊穣)の運命',
  // 属性
  '(虚数|量子)(パ|属性)',
  // 台詞
  '焦土作戦実行',
  // 遺物
  'サルソット', '死水', 'ウェンワーク', 'ツガンニヤ',
  '流雲無痕の過客', '草の穂ガンマン', '純庭教会の聖騎士', '雪の密林の狩人', '成り上がりチャンピオン', '吹雪と対峙する兵士',
  '溶岩で鍛造する火匠', '星の如く輝く天才', '雷鳴轟くバンド', '昼夜の狭間を翔ける鷹', '流星の跡を追う怪盗', '荒地で盗みを働く廃土客',
  '宝命長存の蒔者', '仮想空間を漫遊するメッセンジャー', '灰燼を燃やし尽くす大公', '深い牢獄の囚人', '死水に潜る先駆者', '夢を弄ぶ時計屋',
  '次元界オーナメント', '宇宙封印ステーション', '汎銀河商事会社', '天体階差機関', '盗賊公国タリア', '星々の競技場',
  '折れた竜骨', '蒼穹戦線グラモス', '顕世の出雲と高天の神国',
  // キャラ名
  '桂乃芬', '彦卿', '鏡流', 'スヴァローグ', 'ル(ア|ァ)ン(・)?メ(ェ)?イ', '三月なのか', '停雲', 'ブラックスワン',
  '丹(恒|楓)', '(丹恒(・)?)?飲月', '(Dr\\.)?レイシオ', 'アベンチュリン', '符玄', '素裳', '寒鴉', '景元', '銀狼', '青雀', '乱破',
  '雪衣', 'ブローニャ', 'ジェパード', 'カカリア', 'アルジェンティ', 'ブートヒル',
  'カカワーシャ', 'シヴォーン', 'エヴィキン(人|族)', '忘川守', 'オスワルド(・)?シュナイダー', 'ワー(ビ|ヴィ)ック',
  '(帰忘の)?流離人', 'Mr(\.)?レック',
  // 前後のカタカナと中黒除外、前方の漢字除外
  '(?<![ァ-ヶー・\\p{sc=Han}])(スタレ|モゼ|ギャラガー|カフカ|ヘルタ|ロビン|アスター|フォフォ|ヴェルト|セーバル|アーラン|ホタル|トリビー|トリアン|トリノン|トリスビアス|キュレネ|アナイクス|アナクサゴラス|ヒアンシー|モーディス|サフェル|キャストリス|ファイノン|セイレンス|ケリュドラ|カリュプソー)(ママ)?(?![ァ-ヶー・])',
  // 汎用的なキャラ名はハッシュタグ付きのみ
  '#(モゼ|姫子|トパーズ(＆カブ)?|フック|ペラ|ミーシャ|白露|カフカ|刃|サンポ|ヴェルト|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ルカ|ホタル|花火|黄泉|ジェイド)\\s',
  // 敬称
  '(?<![ァ-ヶー・•\\p{sc=Han}])(姫子|トパーズ(＆カブ)?|フック|白露|刃|サンポ|羅刹|御空|ゼーレ|リンクス|クラーラ|ナターシャ|ホタル|花火|黄泉)(ママ|さん|ちゃん|くん|様)',
  'ヨウおじ',
];
const excludePatterns = [
  '#shindanmaker',
  '#AI画像',
  '#AIイラスト',
  '#aiart',
  '#pixai',
  '#AI',
  'posted by',
  'shindanmaker',
  'kakuyomu',
  'Топовые',
  'トレンド',
  'オープンチャット',
  'ポケモン',
  'カメラ',
  'fireworks',
  'カクヨム',
  'の霊砂',
  'マドリード|チェルシー',
  'ウクライナ',
  'ミサイル',
  'ギャラガー兄弟|オアシス|Oasis|ビルバオ|アトレティコ|スルロット|バルベルデ|シュート|シメオネ',
  '(ノエル|リアム)(・|•)?ギャラガー',
  'アスター(30|麺|工販)',
  '子爵',
  '議員',
  '銀座アスター',
  'ココロコネクト',
  '乱破伝',
  '遠山景元',
  '(稲葉|刑部)姫子',
  '仕掛(け)?花火|打上花火|花火大会|祭り',
  'ロマサガ',
  'ニコ(・|•)?ロビン|ロビンとマリアン|ロビン(・|•)?フッド|クリストファー(・|•)?ロビン|ロビンマスク',
  '#東方',
  'グラブル',
  '小鳥遊',
  'ワンピ(ース)?',
  'ONE(\s)?PIECE',
  'ホタル様',
  '蛍の光|ホタル(鑑賞|祭|見|観)|定点観測|ライブカメラ|ホタルの嫁入り',
  '海辺のカフカ',
  '少年カフカ',
  'カフカ(くん|没|の(虫|父親|日記|小説|変身))',
  'カフカ(\s)?(旅行|日記|全集|短編|断片|論|風)',
  'ぽんぽこ',
  'ゴキブリ',
  '魯迅',
  '素描集',
  '新潮',
  '怪獣8号',
  '(シシド|フランツ)(・|•)?カフカ',
  '忘羨',
  '蔵馬',
  'leak',
  '^(?!.*デイリークエスト).*リーク.*',
  'リコ(\s|・|•)?ブローニャ',
  'ベルリン',
  '銀狼怪奇',
  '眼鏡流',
  '鳴潮|めいちょう|なるしお',
  'ゼンゼロ',
  'ゼンレス',
  'Zenless\s?Zone\s?Zero',
  'ZZZ',
  'スプラトゥーン',
  'splatoon',
  'けもフレ|けものフレンズ',
  // ツイステ・ジェイド関連
  'ツイステ',
  'ジャミル',
  'ユニ魔',
  'ユニーク魔法',
  'フロイド',
  'マスシェフ',
  'ショックザハーツ',
  '#TikTok',
  '#TikTokライト',
  '#Vtuber',
  '#投資',
  '#投機',
  '#FX',
  'MOD',
  'SorryWereClosed',
  '(jp\\.)?mercari\\.com',
  'gamebanana\\.com',
  'geemato\\.com',
  'tiktok\\.com',
  'magmoe\\.com',
  'mag\\.moe',
  'genshin-goods\\.com',
  'kusogame\\.com',
  'playing-games\\.com',
  'act\\.hoyoverse\\.com\\/sr\\/event',
  'dlsite\\.com',
  'dmm\\.co\\.jp',
  'dmm\\.com',
  'rakuten\\.co\\.jp',
  'x\.gd',
  'pixai\.art',
  // ネガティブな単語
  '論争',
  '飽き(た|る)',
  'アンインストール',
  '面白く(な|無)い',
  'つま(ら|ん)な(い)?',
  'おもんな|だるい',
  '引退',
  '萎え|嫌い',
  '(や|辞|止)め(た|る|よ)',
  'キモ(い|過|す)',
  '(?<![ァ-ヶー・\\p{sc=Han}])(ヘイト|モチベ|ﾓﾁﾍﾞ|クソゲ|ｸｿｹﾞ|キショい|ボケ|ゴミ|カス)(?![ァ-ヶー・])',
];
const regExp = new RegExp(matchPatterns.join('|'), 'iu');
const excludeRegExp = new RegExp(excludePatterns.join('|'), 'is');
const MAX_TEXT_LENGTH = 500;

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    try {
      if (!isCommit(evt)) return;

      const ops = await getOpsByType(evt);

      // バッチ削除処理: 各削除のために個別のクエリを発行せず、
      // 削除対象URIの配列を作成して一括削除する
      const deletionUris = ops.posts.deletes.map((del) => del.uri);

      if (deletionUris.length > 0) {
        await this.db
          .deleteFrom('post')
          .where('uri', 'in', deletionUris)
          .execute();
      }

      // バッチ作成処理: すべての作成対象投稿をまず配列にまとめてから、
      // 一括挿入することでDBアクセス回数を減らす
      const postsToInsert: Post[] = [];

      for (const create of ops.posts.creates) {
        const langs = create.record.langs;
        const text = create.record.text.slice(0, MAX_TEXT_LENGTH);
        const hasReply = create.record.reply !== undefined || /^@/.test(text);
        const isValidLang = langs && langs.some((lang) =>
          (lang === 'ja' || lang === 'ja-JP') &&
          !lang.startsWith('zh') &&
          !lang.startsWith('ru')
        );

        if (!isValidLang || hasReply) continue;
        if (excludeRegExp.test(text)) continue;
        if (!regExp.test(text)) continue;

        postsToInsert.push({
          uri: create.uri,
          cid: create.cid,
          text: text,
          replyParent: create.record.reply?.parent.uri ?? null,
          replyRoot: create.record.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        });
      }

      if (postsToInsert.length > 0) {
        await this.db
          .insertInto('post')
          .values(postsToInsert)
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    } catch (error) {
      console.error('Error handling event:', error);
    }
  }
}
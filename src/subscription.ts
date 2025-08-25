import type { Post } from './db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'
import { getUserHistory } from './util/user-history'
import fs from 'fs-extra';

// 強力なゲーム関連キーワード（確実にゲーム投稿）
const strongGameKeywords = [
  // ゲーム固有のキーワード
  '崩壊スターレイル', '崩スタ', 'スターレイル', '(ho(n|u)kai:?\\s?)?star\\s?rail',
  'ピノコニー', '仙舟',
  '天才クラブ', 'スクリューガム', 'ポルカ(・)?カカム', '静寂の主', 'セセルカル', 'イリアスサラス', '原始博士', '余清塗', '柏環',
  '星穹列車', '星核ハンター', '絶滅大君', '巡海レンジャー', '反物質レギオン', '博識学会', '建創者',
  '焼却人', '虚構歴史学者', '純美の騎士団', '仮面の愚者', '弔伶人', 'ガーデン\\s?オブ\\s?リコレクション',
  'スターピースカンパニー', 'アナイアレイトギャング', 'ナナシビト', '次元プーマン', '星軌チケット',
  '魔陰の身', '雲騎軍', '持明族', '龍尊', '天舶司', '冥火大公', 'ウーウーボ',
  '模擬宇宙', '次元界分裂', '階差宇宙', '黄金と機械', '宇宙の蝗害', '凝結虚影', '歴戦余韻',
  '侵蝕トンネル', '疑似花萼', '虚構叙事', '忘却の庭', '混沌の記憶', '末日の幻影', '銀河打者', '超撃破',
  '羅浮', 'ヤリーロ', '朱明', '光円錐',
  // v1.1キーワード
  '脱鱗',
  // v2.0キーワード
  '(?<![ァ-ヶー・•\\p{sc=Han}])(ホテル)?(・|•)?レバリー', 'ナイトメアテレビ局',
  // v2.1キーワード
  '深淵への狂走', 'クラークフィルムランド', '朝露の館', '杯の中の逸話', '戦意の潮', '開拓伝説', '星間旅行スゴロク',
  // v2.2キーワード
  'ハルモニア聖歌隊', 'ディエス(・)?ドミニ', 'クロックボーイ',
  // v2.3キーワード
  '椒丘', '江戸星', '海洋惑星', 'アゲートの世界|メルスタイン', 'ガラス光帯', 'パトレヴィニツィア',
  '演武典礼', '飛霄', '曜青', '懐炎', '雲璃', '伝説の新人剣士', '焔輪八葉', 'オーナメント抽出', '(周期|通常)演算',
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
  // v3.0キーワード
  'アグライア', 'オクヘイマ', '遂願樹脂', '変数サイコロ', '黄金裔', 'ミュリオン', 'ニカドリー|ケファレ|ジョーリア|モネータ|オロニクス|タレンタム|ファジェイナ', '(紛争|世を背負う|大地|理性|浪漫|歳月|法|死|詭術|天空|海洋)(」)?のタイタン',
  '(キメラ|ライオン)組', 'アザラシ大作戦', 'セファリア', 'ヒア丹', '丹ヒア', 'アグサフェ', 'サフェアグ', 'アグセファ', 'セファアグ',
  // v3.4キーワード
  'NeiKos496', 'PhiLia093', 'OreXis945', 'EpieiKeia216', 'SkeMma720', 'δ(-)?me13', 'カスライナ', '皇帝のセプター',
  '風焔', '鉄墓', '星嘯', '鋳王', '誅羅',
  // v3.5キーワード
  '長夜月', '剣旗卿', '騰荒', '荒笛', 'ザンダー(・|•)?ワン(・|•)?クワバラ', '迷境食堂',
  // 音楽
  '銀河を独り揺蕩う', '傷(付|つ)く誰かの心を守る(こと|事)が(できた|出来た)なら', '翼の生えた希望',
  // 星神
  'ミュトゥス', 'アキヴィリ', 'ナヌーク', '浮黎', 'タイズルス',
  // 運命
  '存護', '巡狩',
  // 属性
  '(虚数|量子)(パ|属性)',
  // 台詞
  '焦土作戦実行',
  // 遺物
  'サルソット', 'ウェンワーク', 'ツガンニヤ',
  '流雲無痕の過客', '草の穂ガンマン', '純庭教会の聖騎士', '雪の密林の狩人', '成り上がりチャンピオン', '吹雪と対峙する兵士',
  '溶岩で鍛造する火匠', '星の如く輝く天才', '雷鳴轟くバンド', '昼夜の狭間を翔ける鷹', '流星の跡を追う怪盗', '荒地で盗みを働く廃土客',
  '宝命長存の蒔者', '仮想空間を漫遊するメッセンジャー', '灰燼を燃やし尽くす大公', '深い牢獄の囚人', '死水に潜る先駆者', '夢を弄ぶ時計屋',
  '次元界オーナメント', '宇宙封印ステーション', '汎銀河商事会社', '天体階差機関', '盗賊公国タリア', '星々の競技場',
  '折れた竜骨', '蒼穹戦線グラモス', '顕世の出雲と高天の神国',
  // キャラ名（固有度の高いもの）
  '桂乃芬', '鏡流', 'スヴァローグ', 'ル(ア|ァ)ン(・)?メ(ェ)?イ', '停雲',
  '丹(恒|楓)', '(丹恒(・)?)?飲月', '(Dr\\.)?レイシオ', '符玄', '素裳', '寒鴉', '青雀',
  '雪衣', 'カカリア', 'アルジェンティ', 'ブートヒル', '三月なのか',
  'カカワーシャ', 'シヴォーン', 'エヴィキン(人|族)', '忘川守', 'オスワルド(・)?シュナイダー', 'ワー(ビ|ヴィ)ック',
  '(帰忘の)?流離人', 'Mr(\.)?レック',
  // 前後のカタカナと中黒除外、前方の漢字除外
  '(?<![ァ-ヶー・\\p{sc=Han}])(ながよづき|アフリート|ヘレクトラ|ポポン|セーバル|トリビー|トリアン|トリノン|トリスビアス|キュレネ|アナイクス|アナクサゴラス|ヒアンシー|モーディス|サフェル|キャストリス|ファイノン|セイレンス|ケリュドラ)(ママ)?(?![ァ-ヶー・])',
  // 敬称
  '(?<![ァ-ヶー・•\\p{sc=Han}])(白露|サンポ|御空|リンクス|ナターシャ)(ママ|さん|ちゃん|くん|様)',
  'ヨウおじ',
];
const destiny = [
  '虚無', '均衡', '秩序', '繁殖', '開拓', '神秘', '貪慾', '愉悦', '記憶', '調和', '豊穣', '知恵', '壊滅', '刃', 'ロビン', '花火', 'ジェイド',
];
// 曖昧なキーワード（他コンテンツと被る可能性）
const ambiguousKeywords = [
  '(?<![ァ-ヶー・\\p{sc=Han}])スタレ(?![ァ-ヶー・])',
  'ブローニャ', 'ヴェルト', '姫子', '銀狼', 'ゼーレ', 'ヘルタ', 'フォフォ', 'アーラン',
  'ホタル', 'クラーラ', '黄泉', 'ブラックスワン', 'ルサカ',
  '景元', '彦卿', '停雲', 'ジェパード', 'カフカ', '乱破', '霊砂',
  'ウロボロス', 'テルミヌス', 'ヌース', 'クリフォト', '薬師', '光逝',
  ...destiny, '純美',
  'ミュトゥス', 'アッハ', 'イドリラ', 'ザンダー',
  '死水', 'アベンチュリン', 'ライコス',
  'アスター', 'トパーズ', 'ミーシャ', '白露', 'ギャラガー',
  'サンポ', '羅刹', '御空', 'リンクス', 'ナターシャ', 'カリュプソー',
];
const matchPatterns = [...strongGameKeywords, ...ambiguousKeywords];

const excludePatterns = [
  '#shindanmaker',
  '#AI画像',
  '#AIイラスト',
  '#aiart',
  '#pixai',
  '#AI',
  '#原神',
  '#GenshinImpact',
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
  'マドリード|チェルシー',
  'ウクライナ',
  'ミサイル',
  'スタレゾ',
  'ギャラガー兄弟|オアシス|Oasis|ビルバオ|アトレティコ|スルロット|バルベルデ|シュート|シメオネ',
  '(ノエル|リアム)(・|•)?ギャラガー',
  'アスター(30|麺|工販)',
  '子爵',
  '議員',
  '銀座アスター',
  'ココロコネクト',
  '乱破伝',
  '遠山景元',
  '薬師岳',
  '(稲葉|刑部)姫子',
  '仕掛(け)?花火|打上花火|花火大会|祭り|線香花火',
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
  '黄泉のツガイ',
  '鬼滅の刃',
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
  '(?<![ァ-ヶー・\\p{sc=Han}])(ヘイト|モチベ|ﾓﾁﾍﾞ|アホ|馬鹿|バカ|クソ|クソゲ|ｸｿｹﾞ|キショい|ボケ|ゴミ|カス)(?![ァ-ヶー・])',
];
const regExp = new RegExp(matchPatterns.join('|'), 'iu');
const excludeRegExp = new RegExp(excludePatterns.join('|'), 'is');
const MAX_TEXT_LENGTH = 500;

// ゲーム文脈を示すキーワード
const gameContextKeywords = [
  'ガチャ', '星5', '星4', '配布', 'イベント', 'バージョン', 'アップデート',
  '天井', '確定', '実装', 'PU', 'ピックアップ', '復刻', '新キャラ',
  '遺物', 'ビルド', 'パーティ', 'チーム編成', 'おすすめ', '攻略'
];
const starrailHashTag = /#(スタレ|崩スタ|HonkaiStarRail|HSR|スターレイル|崩壊スターレイル)/;

const strongGameRegex = new RegExp(strongGameKeywords.join('|'), 'i');
const ambiguousRegex = new RegExp(ambiguousKeywords.join('|'), 'i');
const gameContextRegex = new RegExp(gameContextKeywords.join('|'), 'i');

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
        const text = create.record.text.slice(0, MAX_TEXT_LENGTH);
        const hasReply = create.record.reply !== undefined || /^@/.test(text);

        if (hasReply) continue;
        if (excludeRegExp.test(text)) continue;
        if (!regExp.test(text)) continue;

        // ユーザーDIDを取得
        const userDid = create.uri.split('/')[2]; // at://did:xxx/... からDIDを抽出

        // strongGameRegex チェック
        const isStrongGamePost = strongGameRegex.test(text);
        
        // 高精度フィルタリング
        const shouldInclude = await this.shouldIncludePost(text, userDid);
        
        if (shouldInclude) {
          // ユーザー履歴を更新（ゲーム投稿として記録）
          getUserHistory().updateUserPost(userDid, true, isStrongGamePost);

          postsToInsert.push({
            uri: create.uri,
            cid: create.cid,
            text: text,
            replyParent: create.record.reply?.parent.uri ?? null,
            replyRoot: create.record.reply?.root.uri ?? null,
            indexedAt: new Date().toISOString(),
          });
        } else {
          // フィルターで除外されたが、ユーザー履歴は更新（非ゲーム投稿として記録）
          getUserHistory().updateUserPost(userDid, false, isStrongGamePost);
        }
      }

      if (postsToInsert.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          try {
            let log = '';
            if (await fs.pathExists('./feed.log')) {
              log = await fs.readFile('./feed.log', { encoding: 'utf-8' });
            }
            await fs.writeFile('./feed.log', `${JSON.stringify(postsToInsert, null, '  ')}\n${log}`);
          } catch (error) {
            console.warn('Failed to write feed.log:', error.message);
          }
        }
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

  /**
   * 高精度フィルタリング：ユーザー履歴とコンテキストを考慮
   */
  private async shouldIncludePost(text: string, userDid: string): Promise<boolean> {
    // 強力なゲームキーワードは無条件で通す
    if (strongGameRegex.test(text)) {
      return true;
    }

    // 曖昧なキーワードの場合は詳細判定
    if (ambiguousRegex.test(text)) {
      // 曖昧キーワードの出現数をカウント
      const ambiguousMatches = ambiguousKeywords.filter(keyword => 
        new RegExp(keyword, 'i').test(text)
      );
      // destiny変数（汎用的な運命キーワード）のマッチ数をカウント
      const destinyMatches = destiny.filter(keyword => 
        new RegExp(keyword, 'i').test(text)
      );
      // destiny以外のambiguousキーワードのマッチ数
      const nonDestinyMatches = ambiguousMatches.filter(keyword => 
        !destiny.includes(keyword)
      );
      // 確実なゲーマーでも、destiny単独1個の場合は詳細判定する
      const isConfirmedGamer = await getUserHistory().isConfirmedGamer(userDid);

      if (isConfirmedGamer) {
        // destinyのみ1個の場合は詳細判定を行う
        if (destinyMatches.length === 1 && nonDestinyMatches.length === 0) {
          // 他の条件もチェックする（下記の詳細判定に続く）
        } else {
          // destiny以外の曖昧キーワードがある、または destiny が複数ある場合は問答無用で通す
          return true;
        }
      }
      
      // destiny単独1個の場合は、高信頼度ユーザーでも厳格判定
      if (destinyMatches.length === 1 && nonDestinyMatches.length === 0) {
        // ハッシュタグをチェック
        const hasGameHashtag = starrailHashTag.test(text);
        
        if (!hasGameHashtag) {
          return false; // ゲーム文脈またはハッシュタグが必要
        }
      }

      // ユーザーの履歴を確認
      const userConfidence = await getUserHistory().getUserGameConfidence(userDid);
      // ゲーム文脈キーワードの存在をチェック
      const hasGameContext = gameContextRegex.test(text);
      // ハッシュタグをチェック
      const hasGameHashtag = starrailHashTag.test(text);
      
      // 複合判定スコア計算
      let score = 0;
      
      if (userConfidence > 0.7) score += 0.6;        // 高信頼度ユーザー
      else if (userConfidence > 0.4) score += 0.3;   // 中信頼度ユーザー
      else if (userConfidence > 0.1) score += 0.1;   // 低信頼度ユーザー
      
      if (hasGameContext) score += 0.4;              // ゲーム文脈あり
      if (hasGameHashtag) score += 0.3;              // ゲームハッシュタグあり
      
      // スマートな複数キーワード判定
      if (nonDestinyMatches.length >= 2) {
        // destiny以外の曖昧キーワードが2個以上：確実にスコアアップ
        score += 0.3;
      } else if (nonDestinyMatches.length >= 1 && destinyMatches.length >= 1) {
        // destiny以外1個 + destiny1個以上：組み合わせでスコアアップ
        score += 0.3;
      } else if (destinyMatches.length >= 3) {
        // destinyのみだが3個以上：高確率でゲーム関連
        score += 0.2;
      }
      // destinyのみ1-2個の場合はスコアアップなし（汎用的すぎる）

      if (process.env.NODE_ENV === 'development' && score >= 0.4) {
        try {
          const line = `score: ${score}, destiny: ${destinyMatches.length}, nonDestiny: ${nonDestinyMatches.length}, text: ${text}`;
          let log = '';
          if (await fs.pathExists('./feed.log')) {
            log = await fs.readFile('./feed.log', { encoding: 'utf-8' });
          }
          await fs.writeFile('./feed.log', `${line}\n${log}`);
        } catch (error) {
          console.warn('Failed to write feed.log:', error.message);
        }
      }
      
      // しきい値判定（0.5以上で通す）
      return score >= 0.5;
    }

    // その他のキーワードは通す
    return true;
  }
}
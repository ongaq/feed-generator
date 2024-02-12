import type { Post } from './db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'
import kuromoji from 'kuromoji';

function isSUTARE(post: string, keyword: string): Promise<boolean> {
  return new Promise((resolve) => {
    kuromoji.builder({ dicPath: './dict' }).build((err, tokenizer) => {
      if (err) resolve(false)

      try {
        const tokens = tokenizer.tokenize(post)

        for (const token of tokens) {
          if (token.surface_form === keyword && token.pos === '名詞') {
            return resolve(true)
          }
        }
        return resolve(false)
      } catch (e) {
        console.error(e)
        return resolve(false)
      }
    })
  })
}
export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    let postsToCreate: Post[] = [];

    for (const create of ops.posts.creates) {
      const text = create.record.text;
      const regExp = /崩壊スターレイル|崩スタ|スターレイル|(ho(n|u)kai:?\s?)?star\s?rail|ピノコニー|仙舟|羅浮|ヤリーロ|桂乃芬|彦卿|鏡流|ルアン(・)?メェイ|三月なのか|停雲|ブラックスワン|丹恒|(丹恒(・)?)?飲月|(Dr\.)?レイシオ|アベンチュリン|符玄|素裳|寒鴉|#(hsr|姫子|トパーズ(＆カブ)?|アスター|フック|ジェパード|ペラ|ヘルタ|ミーシャ|白露|景元|カフカ|セーバル|アーラン|ブローニャ|刃|フォフォ|サンポ|ヴェルト|羅刹|御空|ゼーレ|銀狼|青雀|リンクス|雪衣|クラーラ|アルジェンティ|ナターシャ|ルカ|ホタル|花火)/ig;

      if (text.match(regExp) !== null || (text.includes('スタレ') && await isSUTARE(text, 'スタレ'))) {
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
      console.log(postsToCreate);

      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}

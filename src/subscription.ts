import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    // for (const post of ops.posts.creates) {
    //   console.log(post.record.text)
    // }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        const text = create.record.text;
        const regExp = /崩壊スターレイル|崩スタ|スタレ|スターレイル|(ho(n|u)kai:?\s?)?star\s?rail|#(姫子|トパーズ(＆カブ)?|アスター|フック|桂乃芬|彦卿|ジェパード|鏡流|ルアン(・)?メェイ|三月なのか|ペラ|ヘルタ|ミーシャ|白露|景元|カフカ|停雲|セーバル|アーラン|ブローニャ|刃|フォフォ|ブラックスワン|丹恒|サンポ|ヴェルト|羅刹|丹恒・飲月|(Dr\.)?レイシオ|御空|ゼーレ|銀狼|符玄|青雀|リンクス|雪衣|クラーラ|アルジェンティ|素裳|ナターシャ|ルカ|寒鴉|ホタル|花火)/ig;
        return text.match(regExp) !== null;
      })
      .map((create) => {
        // map alf-related posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          text: create.record.text,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

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

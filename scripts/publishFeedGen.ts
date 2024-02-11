import dotenv from 'dotenv'
import { AtpAgent, BlobRef } from '@atproto/api'
import fs from 'fs/promises'
import { ids } from '../src/lexicon/lexicons'

const run = async () => {
  dotenv.config()

  // YOUR bluesky handle
  // Ex: user.bsky.social
  const handle = 'yukimis.blue'

  // YOUR bluesky password, or preferably an App Password (found in your client settings)
  // Ex: abcd-1234-efgh-5678
  if (!process.env.FEEDGEN_PUBLISH_APP_PASSWORD) {
    throw new Error('Please provide an app password in the .env file')
  }
  const password = process.env.FEEDGEN_PUBLISH_APP_PASSWORD

  // A short name for the record that will show in urls
  // Lowercase with no spaces.
  // Ex: whats-hot
  const recordName = 'star-rail'

  // A display name for your feed
  // Ex: What's Hot
  const displayName = '崩壊スターレイルfeed'

  // (Optional) A description of your feed
  // Ex: Top trending content from the whole network
  const description = '崩壊スターレイル|崩スタ|スタレ|スターレイル|(ho(n|u)kai:?\s?)?star\s?rail|#(姫子|トパーズ(＆カブ)?|アスター|フック|桂乃芬|彦卿|ジェパード|鏡流|ルアン(・)?メェイ|三月なのか|ペラ|ヘルタ|ミーシャ|白露|景元|カフカ|停雲|セーバル|アーラン|ブローニャ|刃|フォフォ|ブラックスワン|丹恒|サンポ|ヴェルト|羅刹|丹恒・飲月|(Dr\.)?レイシオ|御空|ゼーレ|銀狼|符玄|青雀|リンクス|雪衣|クラーラ|アルジェンティ|素裳|ナターシャ|ルカ|寒鴉|ホタル|花火)'

  // (Optional) The path to an image to be used as your feed's avatar
  // Ex: ~/path/to/avatar.jpeg
  const avatar: string = ''

  // -------------------------------------
  // NO NEED TO TOUCH ANYTHING BELOW HERE
  // -------------------------------------

  if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
    throw new Error('Please provide a hostname in the .env file')
  }
  const feedGenDid =
    process.env.FEEDGEN_SERVICE_DID ?? `did:web:${process.env.FEEDGEN_HOSTNAME}`

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  let avatarRef: BlobRef | undefined
  if (avatar) {
    let encoding: string
    if (avatar.endsWith('png')) {
      encoding = 'image/png'
    } else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
      encoding = 'image/jpeg'
    } else {
      throw new Error('expected png or jpeg')
    }
    const img = await fs.readFile(avatar)
    const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
      encoding,
    })
    avatarRef = blobRes.data.blob
  }

  await agent.api.com.atproto.repo.putRecord({
    repo: agent.session?.did ?? '',
    collection: ids.AppBskyFeedGenerator,
    rkey: recordName,
    record: {
      did: feedGenDid,
      displayName: displayName,
      description: description,
      avatar: avatarRef,
      createdAt: new Date().toISOString(),
    },
  })

  console.log('All done 🎉')
}

run()

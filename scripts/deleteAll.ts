import { resolveDid } from './utils';
import { deleteUserByDid } from './deleteUser';
import { deletePostByAtUri } from './deletePost';

// URLタイプの判定と統合削除処理
async function deleteAllFromBlueskyUrl(blueskyUrl: string) {
  try {
    console.log(`🚀 統合削除処理開始: ${blueskyUrl}`);
    
    // URLタイプの判定
    const isPostUrl = blueskyUrl.includes('/post/');
    const isProfileUrl = blueskyUrl.includes('/profile/') && !isPostUrl;
    
    if (isPostUrl) {
      console.log('📝 POST URLを検出 - POST削除 + ユーザー削除を実行します');
      
      // POST URLからユーザー名とポストIDを抽出
      const urlMatch = blueskyUrl.match(/https:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\/]+)/);
      
      if (!urlMatch) {
        throw new Error('❌ Invalid Bluesky post URL format. Expected: https://bsky.app/profile/username/post/postId');
      }
      
      const [, username, postId] = urlMatch;
      console.log(`👤 Username: ${username}`);
      console.log(`📝 Post ID: ${postId}`);
      
      // DIDを解決
      const did = await resolveDid(username);
      
      // AT-URIを構築
      const atUri = `at://${did}/app.bsky.feed.post/${postId}`;
      
      // 1. POST削除
      const postDeleted = await deletePostByAtUri(atUri);
      
      // 2. ユーザー削除
      const userDeleted = await deleteUserByDid(did);
      
      // 結果サマリー
      console.log('\n🔸 ===== 削除処理結果サマリー =====');
      console.log(`📝 POST削除: ${postDeleted ? '✅ 成功' : '❌ 失敗またはデータなし'}`);
      console.log(`👤 ユーザー削除: ${userDeleted ? '✅ 成功' : '❌ 失敗またはデータなし'}`);
      
      if (postDeleted || userDeleted) {
        console.log('🎉 削除処理が完了しました！');
      } else {
        console.log('ℹ️  削除対象のデータが見つかりませんでした。');
      }
      
    } else if (isProfileUrl) {
      console.log('👤 プロフィールURLを検出 - ユーザー削除のみを実行します');
      
      // プロフィールURLからユーザー名を抽出
      const usernameMatch = blueskyUrl.match(/profile\/([^\/]+)/);
      
      if (!usernameMatch) {
        throw new Error('❌ Could not extract username from Bluesky URL');
      }
      
      const username = usernameMatch[1];
      console.log(`👤 Username: ${username}`);
      
      // DIDを解決
      const did = await resolveDid(username);
      
      // ユーザー削除
      const userDeleted = await deleteUserByDid(did);
      
      // 結果サマリー
      console.log('\n🔸 ===== 削除処理結果サマリー =====');
      console.log(`👤 ユーザー削除: ${userDeleted ? '✅ 成功' : '❌ 失敗またはデータなし'}`);
      
      if (userDeleted) {
        console.log('🎉 ユーザー削除処理が完了しました！');
      } else {
        console.log('ℹ️  削除対象のユーザーデータが見つかりませんでした。');
      }
      
    } else {
      throw new Error('❌ サポートされていないURL形式です。プロフィールURLまたはPOST URLを指定してください。');
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Get URL from command line arguments
const blueskyUrl = process.argv[2];

if (!blueskyUrl) {
  console.error('❌ Usage: yarn deleteAll <bluesky-url>');
  console.error('📝 Examples:');
  console.error('   POST削除 + ユーザー削除: yarn deleteAll https://bsky.app/profile/username.bsky.social/post/3kh5j2l3k4m');
  console.error('   ユーザー削除のみ: yarn deleteAll https://bsky.app/profile/username.bsky.social');
  process.exit(1);
}

if (!blueskyUrl.includes('bsky.app')) {
  console.error('❌ Please provide a valid Bluesky URL (must contain bsky.app)');
  process.exit(1);
}

deleteAllFromBlueskyUrl(blueskyUrl);
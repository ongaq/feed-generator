import { execSqlite, resolveDid, isEmptyResult } from './utils';

// POST削除関数（AT-URIから直接削除）
export async function deletePostByAtUri(atUri: string): Promise<boolean> {
  console.log('\n🔸 ===== POST削除処理開始 =====');
  console.log(`🔗 AT-URI: ${atUri}`);

  // Step 1: Check if post exists in database
  console.log('🔍 Checking if post exists in database...');

  const selectSql = `SELECT uri, text FROM post WHERE uri = '${atUri}';`;

  try {
    const selectResult = await execSqlite(selectSql);

    // Check if no results
    if (isEmptyResult(selectResult)) {
      console.log('ℹ️  Post not found in feed database. Nothing to delete.');
      return false;
    }

    console.log('📊 Post found in database:');
    console.log(selectResult);

    // Step 2: Delete post
    console.log('🗑️  Deleting post from database...');

    const deleteSql = `DELETE FROM post WHERE uri = '${atUri}';`;
    await execSqlite(deleteSql);

    console.log('✅ Post deleted successfully!');

    // Step 3: Confirm deletion
    console.log('🔍 Confirming deletion...');
    const confirmResult = await execSqlite(selectSql);

    // Check deletion confirmation
    if (isEmptyResult(confirmResult)) {
      console.log('✅ Post deletion confirmed.');
      return true;
    } else {
      console.log('⚠️  Warning: Post might still exist in database.');
      console.log('Debug - confirmResult:', JSON.stringify(confirmResult));
      return false;
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Post deletion failed: ${message}`);
    return false;
  }
}

async function deletePostFromBlueskyUrl(blueskyUrl: string) {
  try {
    console.log(`🔍 Processing Bluesky post URL: ${blueskyUrl}`);
    
    // Step 1: Extract AT-URI from Bluesky URL
    console.log('📡 Extracting AT-URI from Bluesky URL...');
    
    // URL format: https://bsky.app/profile/username/post/postId
    const urlMatch = blueskyUrl.match(/https:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\/]+)/);
    
    if (!urlMatch) {
      throw new Error('❌ Invalid Bluesky post URL format. Expected: https://bsky.app/profile/username/post/postId');
    }
    
    const [, username, postId] = urlMatch;
    console.log(`👤 Username: ${username}`);
    console.log(`📝 Post ID: ${postId}`);
    
    // Step 2: Resolve DID from username
    const did = await resolveDid(username);
    
    // Step 3: Construct AT-URI
    const atUri = `at://${did}/app.bsky.feed.post/${postId}`;
    console.log(`🔗 AT-URI: ${atUri}`);
    
    // Step 4: Delete post using exported function
    await deletePostByAtUri(atUri);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// このファイルが直接実行された時だけ動くように（他のファイルから呼び出された時には動かないように）
if (require.main === module) {
  const blueskyUrl = process.argv[2];

  if (!blueskyUrl) {
    console.error('❌ Usage: yarn deletePost <bluesky-post-url>');
    console.error('📝 Example: yarn deletePost https://bsky.app/profile/username.bsky.social/post/3kh5j2l3k4m');
    process.exit(1);
  }

  if (!blueskyUrl.includes('bsky.app/profile/') || !blueskyUrl.includes('/post/')) {
    console.error('❌ Please provide a valid Bluesky post URL (must contain bsky.app/profile/.../post/...)');
    process.exit(1);
  }

  deletePostFromBlueskyUrl(blueskyUrl);
}
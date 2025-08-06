import crypto from 'crypto';
import { execAsync, resolveDid, isEmptyResult } from './utils';

// ユーザー削除関数（DIDから直接削除）
export async function deleteUserByDid(did: string): Promise<boolean> {
  console.log('\n🔸 ===== ユーザー削除処理開始 =====');
  console.log(`🆔 DID: ${did}`);
  
  // Step 1: Calculate user hash
  const salt = process.env.USER_HASH_SALT || 'default_salt_2024';
  const userHash = crypto.createHash('sha256')
    .update(did + salt)
    .digest('hex')
    .slice(0, 16);
  
  console.log(`🔑 User hash: ${userHash}`);
  
  // Step 2: Check if user exists in database
  console.log('🔍 Checking if user exists in database...');
  
  const selectCmd = `heroku pg:psql -a bluesky-feed-1 -c "SELECT * FROM user_stats WHERE \\"userHash\\" = '${userHash}';"`;
  
  try {
    const { stdout: selectResult } = await execAsync(selectCmd);
    
    // Check if no results
    if (isEmptyResult(selectResult)) {
      console.log('ℹ️  User not found in database. Nothing to delete.');
      return false;
    }
    
    console.log('📊 User found in database:');
    console.log(selectResult);
    
    // Step 3: Delete user
    console.log('🗑️  Deleting user from database...');
    
    const deleteCmd = `heroku pg:psql -a bluesky-feed-1 -c "DELETE FROM user_stats WHERE \\"userHash\\" = '${userHash}';"`;
    const { stdout: deleteResult } = await execAsync(deleteCmd);
    
    console.log('✅ User deleted successfully!');
    console.log(deleteResult);
    
    // Step 4: Confirm deletion
    console.log('🔍 Confirming deletion...');
    const { stdout: confirmResult } = await execAsync(selectCmd);
    
    // Check deletion confirmation
    if (isEmptyResult(confirmResult)) {
      console.log('✅ User deletion confirmed.');
      return true;
    } else {
      console.log('⚠️  Warning: User might still exist in database.');
      console.log('Debug - confirmResult:', JSON.stringify(confirmResult));
      return false;
    }
    
  } catch (error) {
    console.error(`❌ User deletion failed: ${error.message}`);
    return false;
  }
}

async function deleteUserFromBlueskyUrl(blueskyUrl: string) {
  try {
    console.log(`🔍 Processing Bluesky URL: ${blueskyUrl}`);
    
    // Step 1: Extract DID from Bluesky URL
    console.log('📡 Fetching user DID from Bluesky...');
    
    const response = await fetch(blueskyUrl);
    const html = await response.text();
    
    // Try multiple patterns to extract DID
    let did: string | null = null;
    
    // Pattern 1: Look for did:plc: in various formats
    let didMatch = html.match(/did:plc:[a-z0-9]{24,}/);
    if (didMatch) {
      did = didMatch[0];
    } else {
      // Pattern 2: Look in script tags
      const scriptMatch = html.match(/"did":"(did:plc:[a-z0-9]+)"/);
      if (scriptMatch) {
        did = scriptMatch[1];
      } else {
        // Pattern 3: Look in meta tags or other locations
        const metaMatch = html.match(/content="(did:plc:[a-z0-9]+)"/);
        if (metaMatch) {
          did = metaMatch[1];
        } else {
          // Pattern 4: Look for any did:plc pattern with more relaxed matching
          const relaxedMatch = html.match(/did:plc:[a-zA-Z0-9]{20,}/);
          if (relaxedMatch) {
            did = relaxedMatch[0];
          }
        }
      }
    }
    
    if (!did) {
      console.log('🔍 DID not found in HTML. Trying alternative method...');
      
      // Alternative: Extract username and use AT Protocol API
      const usernameMatch = blueskyUrl.match(/profile\/([^\/]+)/);
      if (usernameMatch) {
        const username = usernameMatch[1];
        console.log(`👤 Found username: ${username}`);
        
        try {
          // Try to resolve DID via AT Protocol
          did = await resolveDid(username);
        } catch (error) {
          throw new Error(`❌ Could not extract DID from Bluesky URL. Username: ${username}, Error: ${error.message}`);
        }
      } else {
        throw new Error('❌ Could not extract username from Bluesky URL');
      }
    } else {
      console.log(`✅ Found DID: ${did}`);
    }
    
    // Step 2: Delete user using exported function
    await deleteUserByDid(did);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// このファイルが直接実行された時だけ動くように（他のファイルから呼び出された時には動かないように）
if (require.main === module) {
  const blueskyUrl = process.argv[2];

  if (!blueskyUrl) {
    console.error('❌ Usage: yarn deleteUser <bluesky-url>');
    console.error('📝 Example: yarn deleteUser https://bsky.app/profile/username.bsky.social/post/xxxxx');
    process.exit(1);
  }

  if (!blueskyUrl.includes('bsky.app')) {
    console.error('❌ Please provide a valid Bluesky URL (must contain bsky.app)');
    process.exit(1);
  }

  deleteUserFromBlueskyUrl(blueskyUrl);
}
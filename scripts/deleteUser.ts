import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function deleteUserFromBlueskyUrl(blueskyUrl: string) {
  try {
    console.log(`🔍 Processing Bluesky URL: ${blueskyUrl}`);
    
    // Step 1: Extract DID from Bluesky URL
    console.log('📡 Fetching user DID from Bluesky...');
    
    const response = await fetch(blueskyUrl);
    const html = await response.text();
    
    // Extract DID from HTML (looking for did:plc: pattern)
    const didMatch = html.match(/did:plc:[a-z0-9]+/);
    if (!didMatch) {
      throw new Error('❌ Could not extract DID from Bluesky URL');
    }
    
    const did = didMatch[0];
    console.log(`✅ Found DID: ${did}`);
    
    // Step 2: Calculate user hash
    const salt = process.env.USER_HASH_SALT || 'default_salt_2024';
    const userHash = crypto.createHash('sha256')
      .update(did + salt)
      .digest('hex')
      .slice(0, 16);
    
    console.log(`🔑 User hash: ${userHash}`);
    
    // Step 3: Check if user exists in database
    console.log('🔍 Checking if user exists in database...');
    
    const selectCmd = `heroku pg:psql -a bluesky-feed-1 -c "SELECT * FROM user_stats WHERE \\"userHash\\" = '${userHash}';"`;
    
    try {
      const { stdout: selectResult } = await execAsync(selectCmd);
      
      if (selectResult.includes('(0 行)') || selectResult.includes('(0 rows)')) {
        console.log('ℹ️  User not found in database. Nothing to delete.');
        return;
      }
      
      console.log('📊 User found in database:');
      console.log(selectResult);
      
      // Step 4: Delete user
      console.log('🗑️  Deleting user from database...');
      
      const deleteCmd = `heroku pg:psql -a bluesky-feed-1 -c "DELETE FROM user_stats WHERE \\"userHash\\" = '${userHash}';"`;
      const { stdout: deleteResult } = await execAsync(deleteCmd);
      
      console.log('✅ User deleted successfully!');
      console.log(deleteResult);
      
      // Step 5: Confirm deletion
      console.log('🔍 Confirming deletion...');
      const { stdout: confirmResult } = await execAsync(selectCmd);
      
      if (confirmResult.includes('(0 行)') || confirmResult.includes('(0 rows)')) {
        console.log('✅ Deletion confirmed. User no longer exists in database.');
      } else {
        console.log('⚠️  Warning: User might still exist in database.');
      }
      
    } catch (error) {
      throw new Error(`❌ Database operation failed: ${error.message}`);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Get URL from command line arguments
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
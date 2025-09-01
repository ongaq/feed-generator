import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

// DIDの解決（ユーザー名から）
export async function resolveDid(username: string): Promise<string> {
  console.log(`🔍 Resolving DID for username: ${username}`);
  
  try {
    const atResponse = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${username}`);
    const atData = await atResponse.json() as { did?: string };
    
    if (!atData.did) {
      throw new Error('Could not resolve DID');
    }
    
    console.log(`✅ Resolved DID: ${atData.did}`);
    return atData.did;
  } catch (error) {
    throw new Error(`Could not resolve DID for username: ${username}. Error: ${error.message}`);
  }
}

// DIDからユーザーハンドルを逆引き
export async function resolveHandle(did: string): Promise<string> {
  console.log(`🔍 Resolving handle for DID: ${did}`);
  
  try {
    const response = await fetch(`https://plc.directory/${did}`);
    const data = await response.json() as { alsoKnownAs?: string[] };
    
    if (!data.alsoKnownAs || data.alsoKnownAs.length === 0) {
      throw new Error('Could not resolve handle');
    }
    
    // alsoKnownAsから最初のat://ハンドルを取得
    const atHandle = data.alsoKnownAs.find(aka => aka.startsWith('at://'));
    if (!atHandle) {
      throw new Error('No at:// handle found');
    }
    
    const handle = atHandle.replace('at://', '');
    console.log(`✅ Resolved handle: ${handle}`);
    return handle;
  } catch (error) {
    throw new Error(`Could not resolve handle for DID: ${did}. Error: ${error.message}`);
  }
}

// AT-URIからBluesky URLを生成
export async function atUriToBskyUrl(atUri: string): Promise<string> {
  console.log(`🔗 Converting AT-URI to Bluesky URL: ${atUri}`);
  
  const match = atUri.match(/^at:\/\/([^\/]+)\/app\.bsky\.feed\.post\/([^\/]+)$/);
  if (!match) {
    throw new Error('Invalid AT-URI format');
  }
  
  const [, did, postId] = match;
  const handle = await resolveHandle(did);
  const bskyUrl = `https://bsky.app/profile/${handle}/post/${postId}`;
  
  console.log(`✅ Generated Bluesky URL: ${bskyUrl}`);
  return bskyUrl;
}

// 削除結果の判定（共通ロジック）
export function isEmptyResult(result: string): boolean {
  return result.includes('(0 ') || result.includes('(0\t') || result.includes('(0\r') || result.includes('(0\n');
}
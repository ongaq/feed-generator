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

// 削除結果の判定（共通ロジック）
export function isEmptyResult(result: string): boolean {
  return result.includes('(0 ') || result.includes('(0\t') || result.includes('(0\r') || result.includes('(0\n');
}
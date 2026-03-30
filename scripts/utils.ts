import { spawn, execSync } from 'child_process';

// Fly.ioアプリ名
const FLY_APP_NAME = 'feed-generator-old-smoke-7764';
const SQLITE_DB_PATH = '/data/feed.db';

// Machine IDをキャッシュ
let cachedMachineId: string | null = null;

// Machine IDを取得
async function getMachineId(): Promise<string> {
  if (cachedMachineId) {
    return cachedMachineId;
  }

  try {
    // fly machine listでmachine IDを取得
    const result = execSync(`fly machine list -a ${FLY_APP_NAME} -j`, {
      encoding: 'utf-8',
      timeout: 15000,
    });

    const machines = JSON.parse(result);
    if (!machines || machines.length === 0) {
      throw new Error('No machines found');
    }

    // 起動中のマシンを優先
    const runningMachine = machines.find((m: { state: string }) => m.state === 'started');
    const machineId: string = runningMachine?.id || machines[0].id;
    cachedMachineId = machineId;

    return machineId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get machine ID: ${message}`);
  }
}

// spawnでコマンドを実行（Windows互換）
function spawnAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],  // stdinを無視（PTY問題回避）
      shell: false,  // シェルを介さない（fly CLIに直接渡す）
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });

    // タイムアウト
    setTimeout(() => {
      proc.kill();
      reject(new Error('Command timed out'));
    }, 30000);
  });
}

// Fly.io machine exec経由でSQLiteコマンドを実行（Windows互換）
export async function execSqlite(sql: string): Promise<string> {
  const machineId = await getMachineId();

  // SQL内のダブルクォートをエスケープ
  const escapedSql = sql.replace(/"/g, '\\"');
  // fly machine execは1つのコマンド引数しか受け付けない
  // execSyncでシェル経由で実行する
  const fullCommand = `fly machine exec ${machineId} -a ${FLY_APP_NAME} "sqlite3 ${SQLITE_DB_PATH} \\"${escapedSql}\\""`;

  try {
    const stdout = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SQLite error: ${message}`);
  }
}

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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not resolve DID for username: ${username}. Error: ${message}`);
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not resolve handle for DID: ${did}. Error: ${message}`);
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
// SQLiteは結果がない場合は空文字列を返す
export function isEmptyResult(result: string): boolean {
  const trimmed = result.trim();
  return trimmed === '' || trimmed.length === 0;
}
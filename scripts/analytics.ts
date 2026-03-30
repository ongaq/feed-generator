const fs = require('fs');
const parseLog = (logFile: string) => {
  const logs = fs.readFileSync(logFile, 'utf-8').split('\n');
  const dailyStats: Record<string, { users: Set<string>; pv: number; }> = {};
  
  logs.forEach((line: string) => {
    const match = line.match(/^(\w+ \d+) \d+:\d+:\d+.*User: (did:plc:\w+)/);
    if (!match) return;
    
    const date = match[1]; // "Jan 16"
    const userId = match[2];
    
    if (!dailyStats[date]) {
      dailyStats[date] = {
        users: new Set(),
        pv: 0
      };
    }
    
    dailyStats[date].users.add(userId);
    dailyStats[date].pv++;
  });
  
  // 結果出力
  console.log('日付\t\tUU数\tPV数');
  console.log('─'.repeat(40));
  Object.entries(dailyStats).forEach(([date, stats]) => {
    console.log(`${date}\t\t${stats.users.size}\t${stats.pv}`);
  });
};

parseLog('access.log');
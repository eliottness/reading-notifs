type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

function log(level: Level, msg: string, ctx?: Context): void {
  const entry = { level, ts: new Date().toISOString(), msg, ...ctx };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Context) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Context) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Context) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Context) => log('error', msg, ctx),
};

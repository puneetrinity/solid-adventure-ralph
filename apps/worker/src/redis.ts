export function parseRedisUrl(redisUrl: string): { host: string; port: number; password?: string } {
  const u = new URL(redisUrl);
  const host = u.hostname;
  const port = u.port ? Number(u.port) : 6379;
  const password = u.password ? u.password : undefined;
  return { host, port, password };
}

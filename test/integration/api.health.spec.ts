const baseUrl = process.env.API_BASE_URL;
const healthPath = process.env.API_HEALTH_PATH || '/api/health';

const run = baseUrl ? test : test.skip;

run('api health endpoint responds 200', async () => {
  const res = await fetch(`${baseUrl}${healthPath}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  expect(res.status).toBe(200);
  const bodyText = await res.text();
  expect(bodyText.length).toBeGreaterThan(0);
});

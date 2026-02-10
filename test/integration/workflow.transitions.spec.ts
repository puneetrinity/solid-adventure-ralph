const baseUrl = process.env.API_BASE_URL;
const bypassToken = process.env.INTEGRATION_AUTH_BYPASS_TOKEN || process.env.AUTH_BYPASS_TOKEN;

const run = baseUrl ? test : test.skip;

const headers = () => {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (bypassToken) {
    base['x-auth-bypass'] = bypassToken;
    base['x-test-user'] = 'ci';
  }
  return base;
};

async function waitForStage(
  workflowId: string,
  stage: string,
  status: string,
  timeoutMs = 60_000
) {
  const started = Date.now();
  let last: any = null;

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/workflows/${workflowId}`, { headers: headers() });
    if (res.ok) {
      const data = await res.json() as { stage: string; stageStatus: string };
      last = data;
      if (data.stage === stage && data.stageStatus === status) {
        return data;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(
    `Timed out waiting for ${stage}/${status}. Last stage=${last?.stage} status=${last?.stageStatus}`
  );
}

run('workflow stage transitions (feasibility → architecture → timeline)', async () => {
  const createRes = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      featureGoal: 'Integration test feature goal',
      businessJustification: 'Integration test justification',
      repos: [
        { owner: 'test-owner', repo: 'test-repo', baseBranch: 'main', role: 'primary' }
      ]
    })
  });

  expect(createRes.ok).toBe(true);
  const created = await createRes.json() as { id?: string; workflow?: { id: string } };
  const workflowId = created.id || created.workflow?.id;
  expect(workflowId).toBeTruthy();

  await waitForStage(workflowId, 'feasibility', 'ready');

  const approveFeasibility = await fetch(
    `${baseUrl}/api/workflows/${workflowId}/stages/feasibility/approve`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ reason: 'ok' })
    }
  );
  expect(approveFeasibility.ok).toBe(true);

  await waitForStage(workflowId, 'architecture', 'ready');

  const approveArchitecture = await fetch(
    `${baseUrl}/api/workflows/${workflowId}/stages/architecture/approve`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ reason: 'ok' })
    }
  );
  expect(approveArchitecture.ok).toBe(true);

  await waitForStage(workflowId, 'timeline', 'ready');
});

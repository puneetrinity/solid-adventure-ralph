const baseUrl = process.env.API_BASE_URL;
const bypassToken = process.env.INTEGRATION_AUTH_BYPASS_TOKEN || process.env.AUTH_BYPASS_TOKEN;

const run = baseUrl ? test : test.skip;

const headers = () => {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
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
  timeoutMs = 120_000
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

async function approveStage(workflowId: string, stage: string) {
  const res = await fetch(`${baseUrl}/api/workflows/${workflowId}/stages/${stage}/approve`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ reason: 'ok' })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Approve stage ${stage} failed: ${res.status} ${body}`);
  }
}

run('patches stage enters needs_changes on forced patch error', async () => {
  const createRes = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      featureGoal: 'Force patch error for integration test',
      businessJustification: 'Test strict patch validation failure path',
      context: '[FORCE_PATCH_ERROR]',
      repos: [
        { owner: 'test-owner', repo: 'test-repo', baseBranch: 'main', role: 'primary' }
      ]
    })
  });

  expect(createRes.ok).toBe(true);
  const created = await createRes.json() as { id?: string; workflow?: { id: string } };
  const workflowId = created.id || created.workflow?.id;
  if (!workflowId) throw new Error('No workflow ID returned');

  await waitForStage(workflowId, 'feasibility', 'ready');
  await approveStage(workflowId, 'feasibility');

  await waitForStage(workflowId, 'architecture', 'ready');
  await approveStage(workflowId, 'architecture');

  await waitForStage(workflowId, 'timeline', 'ready');
  await approveStage(workflowId, 'timeline');

  await waitForStage(workflowId, 'summary', 'ready');
  await approveStage(workflowId, 'summary');

  const finalState = await waitForStage(workflowId, 'patches', 'needs_changes');

  // Verify workflow.feedback contains the error message
  const workflowRes = await fetch(`${baseUrl}/api/workflows/${workflowId}`, { headers: headers() });
  const workflow = await workflowRes.json() as { feedback?: string };

  expect(workflow.feedback).toBeDefined();
  expect(workflow.feedback).toContain('Forced patch validation error');
}, 300_000);

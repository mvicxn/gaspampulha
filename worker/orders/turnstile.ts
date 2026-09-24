export interface TurnstileCheck {
  token: string;
  secret: string;
  hostname?: string;
  action?: string;
  fetcher?: typeof fetch;
}

export async function verifyTurnstile(check: TurnstileCheck): Promise<boolean> {
  if (!check.secret || !check.token) return false;
  const body = new URLSearchParams({ secret: check.secret, response: check.token });
  const fetcher = check.fetcher ?? fetch;
  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) return false;
  const data = (await response.json()) as {
    success?: boolean;
    hostname?: string;
    action?: string;
    metadata?: { result_with_testing_key?: boolean };
  };
  if (data.success !== true) return false;
  const testingKey = data.metadata?.result_with_testing_key === true;
  if (!testingKey && check.hostname && data.hostname !== check.hostname) return false;
  if (check.action && data.action !== check.action && !(testingKey && data.action === undefined)) return false;
  return true;
}

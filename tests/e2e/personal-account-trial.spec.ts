import { expect, test } from '@playwright/test';

test('creates a personal account and keeps its five-day trial after sign-in returns', async ({
  page,
}, testInfo) => {
  const runId = `${Date.now()}-${testInfo.project.name}`;
  const email = `dayweft-${runId}@example.test`;
  const secondEmail = `dayweft-second-${runId}@example.test`;
  const password = 'Dayweft-test-password-5!';

  await page.goto('/');
  await page.getByRole('link', { name: 'Start your five-day trial' }).click();
  await expect(page).toHaveURL(/\/signup$/);

  await page.getByLabel('Name').fill('Fresh Dayweft User');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/profile$/);

  await expect(page.getByRole('heading', { name: 'Fresh Dayweft User' })).toBeVisible();
  await expect(page.locator('main')).toContainText(email);
  const trial = page.getByTestId('trial-status');
  await expect(trial).toContainText('Active');
  await expect(trial).toContainText('Five-day free trial');
  await expect(trial).toContainText('5 days remaining');
  await expect(page.getByText('five days saved to it automatically')).toBeVisible();
  const firstEndDate = await trial.getByText(/\w+ \d{1,2}, \d{4}/).textContent();

  await page.getByRole('link', { name: 'Start a private chat' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  const prompt = 'Help me make a gentle plan for Saturday without overfilling the day.';
  await page.getByLabel('Your prompt').fill(prompt);
  await page.getByRole('button', { name: 'Save conversation' }).click();
  await expect(page.getByTestId('saved-conversation')).toContainText(prompt);
  await expect(page.getByTestId('saved-conversation')).toContainText(
    'The assistant is not available yet',
  );
  await expect(page.getByTestId('saved-conversation')).toContainText('no answer was generated');

  await page.reload();
  await expect(page.getByTestId('saved-conversation')).toContainText(prompt);

  await page.goto('/profile');
  await page.reload();
  await expect(page.getByTestId('trial-status')).toContainText('Active');
  await expect(page.getByTestId('trial-status')).toContainText(firstEndDate ?? '');

  const trialResponse = await page.evaluate(async () => {
    const response = await fetch('/api/trial');
    return { status: response.status, body: await response.json() };
  });
  expect(trialResponse.status).toBe(200);
  expect(trialResponse.body.trial.status).toBe('active');
  const firstStartsAt = trialResponse.body.trial.startsAt;
  const firstEndsAt = trialResponse.body.trial.endsAt;
  expect(
    Date.parse(firstEndsAt) - Date.parse(firstStartsAt),
  ).toBe(5 * 24 * 60 * 60 * 1000);
  const reloadedTrial = await page.evaluate(async () => {
    const response = await fetch('/api/trial');
    return response.json();
  });
  expect(reloadedTrial.trial.startsAt).toBe(firstStartsAt);
  expect(reloadedTrial.trial.endsAt).toBe(firstEndsAt);

  const session = await page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session');
    return response.json();
  });
  expect(session.user.role).toBe('user');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login$/);
  await expect(
    page.evaluate(async () => (await fetch('/api/trial')).status),
  ).resolves.toBe(401);
  await expect(
    page.evaluate(async () => (await fetch('/api/conversations')).status),
  ).resolves.toBe(401);
  await page.goto('/chat');
  await expect(page.getByRole('link', { name: 'Sign in to continue' })).toBeVisible();
  await expect(page.getByText(prompt)).not.toBeVisible();

  await page.goto('/signup');
  await page.getByLabel('Name').fill('Second Dayweft User');
  await page.getByLabel('Email address').fill(secondEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/profile$/);

  const secondConversationResponse = await page.evaluate(async () => {
    const response = await fetch('/api/conversations');
    return {
      status: response.status,
      body: (await response.json()) as { conversations?: unknown[] },
    };
  });
  expect(secondConversationResponse.status).toBe(200);
  expect(secondConversationResponse.body.conversations).toEqual([]);

  await page.goto('/chat');
  await expect(page.getByText('No saved conversations yet.')).toBeVisible();
  await expect(page.getByText(prompt)).not.toBeVisible();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/^http:\/\/[^/]+\/$/);
  await expect(page.getByRole('link', { name: 'Open private chat' })).toBeVisible();
  await page.getByRole('link', { name: 'Open private chat' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByTestId('saved-conversation')).toContainText(prompt);
  await expect(page.getByTestId('saved-conversation')).toContainText(
    'The assistant is not available yet',
  );
  await page.screenshot({ path: testInfo.outputPath('private-first-chat.png'), fullPage: true });

  await page.goto('/profile');
  await expect(page.getByTestId('trial-status')).toContainText('Active');
  await expect(page.getByTestId('trial-status')).toContainText(firstEndDate ?? '');
  const signedInTrial = await page.evaluate(async () => {
    const response = await fetch('/api/trial');
    return response.json();
  });
  expect(signedInTrial.trial.startsAt).toBe(firstStartsAt);
  expect(signedInTrial.trial.endsAt).toBe(firstEndsAt);
});

// Job/local tooling only. Never import this module from the public website.
export type PublisherAuth =
  { mode: "manual"; token: string } | { mode: "service"; clientId: string; clientSecret: string };

export function publisherAuth(
  env: Record<string, string | undefined>,
  manual: boolean,
): PublisherAuth {
  if (manual) {
    if (env.CI || env.GITHUB_ACTIONS) {
      throw new Error(
        "Manual user-token export is local-only. Use service credentials for scheduled jobs.",
      );
    }
    const token = env.FOUNDRY_READ_TOKEN?.trim();
    if (!token) {
      throw new Error(
        "Manual export requires a short-lived FOUNDRY_READ_TOKEN. Use bash scripts/export-manual.sh to enter it privately.",
      );
    }
    return { mode: "manual", token };
  }
  if (env.FOUNDRY_READ_TOKEN) {
    throw new Error(
      "A user token was supplied without explicit --manual mode. No snapshot was replaced.",
    );
  }
  if (!env.FOUNDRY_CLIENT_ID || !env.FOUNDRY_CLIENT_SECRET) {
    throw new Error(
      "Scheduled export requires backend-service credentials. For a local one-time export use bash scripts/export-manual.sh.",
    );
  }
  return {
    mode: "service",
    clientId: env.FOUNDRY_CLIENT_ID,
    clientSecret: env.FOUNDRY_CLIENT_SECRET,
  };
}

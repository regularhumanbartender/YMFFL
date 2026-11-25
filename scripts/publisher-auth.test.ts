import { describe, expect, it } from "vitest";
import { publisherAuth } from "./publisher-auth";

describe("publisher authentication boundaries", () => {
  it("preserves service-user auth for scheduled runs", () => {
    expect(
      publisherAuth(
        { FOUNDRY_CLIENT_ID: "test-id", FOUNDRY_CLIENT_SECRET: "test-only-secret" },
        false,
      ),
    ).toEqual({ mode: "service", clientId: "test-id", clientSecret: "test-only-secret" });
  });
  it("accepts a user token only with explicit local manual mode", () => {
    expect(publisherAuth({ FOUNDRY_READ_TOKEN: "  test-only-token  " }, true)).toEqual({
      mode: "manual",
      token: "test-only-token",
    });
  });
  it("does not silently fall back to personal credentials", () => {
    expect(() => publisherAuth({ FOUNDRY_READ_TOKEN: "test-only-token" }, false)).toThrow(
      "explicit --manual",
    );
  });
  it.each([{ CI: "true" }, { GITHUB_ACTIONS: "true" }])(
    "rejects manual tokens in automation",
    (flags) => {
      expect(() =>
        publisherAuth({ ...flags, FOUNDRY_READ_TOKEN: "test-only-token" }, true),
      ).toThrow("local-only");
    },
  );
  it("requires an actual manual token", () => {
    expect(() => publisherAuth({}, true)).toThrow("short-lived");
    expect(() => publisherAuth({ FOUNDRY_READ_TOKEN: "  " }, true)).toThrow("short-lived");
  });
  it("requires both service credentials for scheduled jobs", () => {
    expect(() => publisherAuth({}, false)).toThrow("backend-service credentials");
    expect(() => publisherAuth({ FOUNDRY_CLIENT_ID: "test-id" }, false)).toThrow(
      "backend-service credentials",
    );
  });
});

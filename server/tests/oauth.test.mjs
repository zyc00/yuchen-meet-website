import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { memoryDb } from "./helpers.mjs";
import { createStore } from "../lib/booking/store.mjs";
import { encrypt } from "../lib/booking/security.mjs";
import { tokenSupplier, CALENDAR_ID } from "../lib/server/oauth.mjs";
import { handleApi } from "../lib/server/api.mjs";
const metadata = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
};
test("revoked refresh token requires reconnection in owner status; transient errors do not revoke", async () => {
  const original = globalThis.fetch;
  try {
    for (const error of ["invalid_grant", "server_error"]) {
      const db = memoryDb(),
        store = createStore(db),
        env = {
          DB: db,
          ADMIN_USERNAME: "owner",
          ADMIN_PASSWORD_HASH: createHash("sha256").update("test-password").digest("hex"),
          GOOGLE_CLIENT_ID: "client",
          GOOGLE_CLIENT_SECRET: "secret",
          TOKEN_ENCRYPTION_KEY: "01".repeat(32),
          OAUTH_REDIRECT_URI: "https://meet.test/api/google/callback",
          MEETING_URL: "https://zoom.test",
        };
      await store.putSetting(
        "google",
        await encrypt(
          JSON.stringify({ refreshToken: "fake", email: CALENDAR_ID }),
          env.TOKEN_ENCRYPTION_KEY,
        ),
      );
      globalThis.fetch = async (url) =>
        String(url).includes("openid-configuration")
          ? Response.json(metadata)
          : Response.json(
              { error },
              { status: error === "invalid_grant" ? 400 : 500 },
            );
      await assert.rejects(tokenSupplier(env, store)());
      const response = await handleApi(
        new Request("https://meet.test/api/admin", {
          headers: {
            authorization: "Basic " + Buffer.from("owner:test-password").toString("base64"),
          },
        }),
        env,
      );
      const state = await response.json();
      assert.equal(state.connected, error !== "invalid_grant");
      assert.equal(state.reconnectRequired, error === "invalid_grant");
    }
  } finally {
    globalThis.fetch = original;
  }
});

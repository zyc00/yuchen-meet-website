import * as oauth from "oauth4webapi";
import { BookingError } from "../booking/domain.mjs";
import { encrypt, decrypt, consumeState } from "../booking/security.mjs";
import { digest } from "../booking/store.mjs";
export const CALENDAR_ID = "zyc0187@engineering.upenn.edu";
const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
const issuer = new URL("https://accounts.google.com");
async function config(env) {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.TOKEN_ENCRYPTION_KEY ||
    !env.OAUTH_REDIRECT_URI
  )
    throw new BookingError(
      "Google connection has not been configured yet.",
      503,
      "setup",
    );
  const as = await oauth.processDiscoveryResponse(
    issuer,
    await oauth.discoveryRequest(issuer, {
      signal: AbortSignal.timeout(10000),
    }),
  );
  return {
    as,
    client: { client_id: env.GOOGLE_CLIENT_ID },
    auth: oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET),
  };
}
export async function beginGoogle(env, db, owner) {
  const { as, client } = await config(env),
    state = oauth.generateRandomState(),
    verifier = oauth.generateRandomCodeVerifier(),
    nonce = oauth.generateRandomNonce();
  await db
    .prepare(
      "INSERT INTO oauth_states (id,owner,verifier,expires) VALUES (?,?,?,?)",
    )
    .bind(
      await digest(state),
      owner,
      await encrypt(
        JSON.stringify({ verifier, nonce }),
        env.TOKEN_ENCRYPTION_KEY,
      ),
      Date.now() + 600000,
    )
    .run();
  const url = new URL(as.authorization_endpoint);
  for (const [key, value] of Object.entries({
    client_id: client.client_id,
    redirect_uri: env.OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    login_hint: CALENDAR_ID,
  }))
    url.searchParams.set(key, value);
  return url.href;
}
export async function completeGoogle(request, env, db, store, owner) {
  const url = new URL(request.url),
    state = url.searchParams.get("state");
  if (!state || state.length > 200)
    throw new BookingError("Expired Google connection. Please try again.");
  const row = await consumeState(db, await digest(state), owner, Date.now());
  if (!row)
    throw new BookingError("Expired Google connection. Please try again.");
  const { verifier, nonce } = JSON.parse(
    await decrypt(row.verifier, env.TOKEN_ENCRYPTION_KEY),
  );
  const { as, client, auth } = await config(env);
  const params = oauth.validateAuthResponse(as, client, url, state);
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    auth,
    params,
    env.OAUTH_REDIRECT_URI,
    verifier,
    { signal: AbortSignal.timeout(10000) },
  );
  const tokens = await oauth.processAuthorizationCodeResponse(
    as,
    client,
    response,
    { expectedNonce: nonce, requireIdToken: true },
  );
  const claims = oauth.getValidatedIdTokenClaims(tokens);
  if (claims?.email !== CALENDAR_ID || claims.email_verified !== true)
    throw new BookingError(
      `Connect ${CALENDAR_ID} to continue.`,
      403,
      "identity",
    );
  if (!tokens.refresh_token)
    throw new BookingError(
      "Offline permission is required. Reconnect and grant calendar access.",
    );
  const granted = new Set((tokens.scope || "").split(" "));
  if (
    scopes.filter((s) => s.startsWith("https://")).some((s) => !granted.has(s))
  )
    throw new BookingError(
      "Grant both calendar permissions to enable booking.",
    );
  await store.putSetting(
    "google",
    await encrypt(
      JSON.stringify({
        refreshToken: tokens.refresh_token,
        email: CALENDAR_ID,
      }),
      env.TOKEN_ENCRYPTION_KEY,
    ),
  );
  await store.putSetting("google-health", null);
}
export function tokenSupplier(env, store) {
  let current = null;
  return async () => {
    if (current && current.expires > Date.now() + 60000)
      return current.accessToken;
    const secret = await store.getSetting("google");
    if (!secret)
      throw new BookingError("Google Calendar is not connected.", 503, "setup");
    const saved = JSON.parse(await decrypt(secret, env.TOKEN_ENCRYPTION_KEY));
    if (saved.email !== CALENDAR_ID)
      throw new Error("Unexpected calendar identity");
    const { as, client, auth } = await config(env);
    const response = await oauth.refreshTokenGrantRequest(
      as,
      client,
      auth,
      saved.refreshToken,
      { signal: AbortSignal.timeout(10000) },
    );
    let tokens;
    try {
      tokens = await oauth.processRefreshTokenResponse(as, client, response);
    } catch (error) {
      if (
        error instanceof oauth.ResponseBodyError &&
        [
          "invalid_grant",
          "invalid_client",
          "unauthorized_client",
          "access_denied",
        ].includes(error.error)
      ) {
        await store.putSetting("google-health", "reconnect_required");
      }
      throw error;
    }
    if (tokens.refresh_token)
      await store.putSetting(
        "google",
        await encrypt(
          JSON.stringify({ ...saved, refreshToken: tokens.refresh_token }),
          env.TOKEN_ENCRYPTION_KEY,
        ),
      );
    current = {
      accessToken: tokens.access_token,
      expires: Date.now() + (tokens.expires_in || 300) * 1000,
    };
    return current.accessToken;
  };
}

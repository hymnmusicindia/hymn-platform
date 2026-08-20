import { OAuth2Client } from "google-auth-library";

const client = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

export async function verifyGoogleCredential(credential: string) {
  if (!client) {
    try {
      const decoded = JSON.parse(Buffer.from(credential, "base64url").toString("utf8"));
      return {
        sub: decoded.sub ?? `dev-${decoded.email}`,
        email: decoded.email,
        name: decoded.name ?? decoded.email?.split("@")[0] ?? "HYMN User",
        picture: decoded.picture ?? null
      };
    } catch {
      throw new Error("Google client is not configured and fallback credential is invalid.");
    }
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) throw new Error("Invalid Google account payload.");

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email.split("@")[0],
    picture: payload.picture ?? null
  };
}

// The kid-auth secret: the KID_AUTH_SECRET environment variable if set, else the one the
// migration generated inside the database (readable only with the service role).
export async function getKidSecret(admin: { rpc: (fn: string) => PromiseLike<{ data: unknown }> }): Promise<string | null> {
  const fromEnv = Deno.env.get('KID_AUTH_SECRET');
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  const { data } = await admin.rpc('kid_auth_secret');
  return typeof data === 'string' && data.length >= 32 ? data : null;
}

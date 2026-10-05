// Makes a push key pair on this computer. Run:  node scripts/vapid-keys.mjs
// Then save the two values as Supabase secrets (Dashboard, Edge Functions, Secrets):
//   VAPID_PUBLIC_KEY   = the public line
//   VAPID_PRIVATE_KEY  = the private line  (keep it secret, never paste it in chat or commit it)
// Nothing is stored or sent anywhere by this script.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
console.log('VAPID_PUBLIC_KEY=' + raw.toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + priv.d);
console.log('\nSave both as Supabase secrets. Keep the private one to yourself.');

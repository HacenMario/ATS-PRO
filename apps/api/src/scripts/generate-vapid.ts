/** Generate VAPID keys for Web Push: npm run vapid:generate --workspace @ats/api */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('\nStore these in apps/api/.env (and in the Railway environment). Never commit real values.');

// Hostinger Node.js hosting launches the entry file through its own wrapper, so the
// "run only when executed directly" guard at the bottom of server.mjs never fires.
// This entry file starts the same app explicitly.
import { createApp } from './server.mjs';

const production = process.env.NODE_ENV === 'production';
if (production && !process.env.APP_ORIGIN) throw Error('Set APP_ORIGIN to your HTTPS website address.');
const { server } = await createApp({ production });
server.listen(Number(process.env.PORT || 3000), production ? '0.0.0.0' : '127.0.0.1',
  () => console.log('BTW company login server ready. Open ' + (process.env.APP_ORIGIN || 'http://127.0.0.1:3000')));

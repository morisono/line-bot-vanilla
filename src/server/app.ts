// src/app.ts
import express from 'express';
import { privacyPolicyRouter } from '../routes/privacyPolicy';
import { cookiePolicyRouter } from '../routes/cookiePolicy';

const app = express();
app.use('/privacy-policy', privacyPolicyRouter);
app.use('/cookie-policy', cookiePolicyRouter);

app.get('/auth/line', (_req, res) => {
  // LINE OAuth 認可リクエストへリダイレクト
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_CHANNEL_ID!,
    redirect_uri: process.env.LINE_CALLBACK_URL!,
    state: 'random_state',
    scope: 'openid email profile'
  });
  res.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
});

app.listen(3000, () => console.log('Server started on http://localhost:3000'));

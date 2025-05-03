// src/routes/privacyPolicy.ts
import { Router, Request, Response } from 'express';
export const privacyPolicyRouter = Router();

privacyPolicyRouter.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head><meta charset="UTF-8"><title>プライバシーポリシー</title></head>
    <body>
      <h1>プライバシーポリシー</h1>
      <h2 id="email-consent">メールアドレス取得／利用目的の提示</h2>
      <p>LINEログインで取得するメールアドレスは、以下目的で利用します :contentReference[oaicite:4]{index=4}:</p>
      <ul>
        <li>重要なお知らせ送付</li>
        <li>パスワードリセット用認証コード送信</li>
        <li>キャンペーン情報配信</li>
      </ul>
      <p>上記以外の目的で使用せず、第三者提供は行いません :contentReference[oaicite:5]{index=5}。</p>
      <form method="GET" action="/auth/line">
        <label>
          <input type="checkbox" name="agree" required>
          上記内容に同意してメールアドレスを提供します
        </label><br>
        <button type="submit">同意してLINEログインへ</button>
      </form>
    </body>
    </html>
  `);
});

// src/routes/cookiePolicy.ts
import { Router, Request, Response } from 'express';
export const cookiePolicyRouter = Router();

cookiePolicyRouter.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head><meta charset="UTF-8"><title>クッキーポリシー</title></head>
    <body>
      <h1>クッキーなどの技術で取得する情報の取り扱いについて</h1>
      <p>当サイトでは以下の情報をクッキーで取得します :contentReference[oaicite:6]{index=6}:</p>
      <ul>
        <li>ページ閲覧履歴（アクセス日時、URL）</li>
        <li>セッション識別情報（ログイン状態維持）</li>
      </ul>
      <p>ブラウザ設定でクッキーを拒否・削除できます :contentReference[oaicite:7]{index=7}。</p>
    </body>
    </html>
  `);
});

import { Router, json } from 'express';
import * as store from './corepass-store.js';

export function createCorepassRouter(): Router {
  const router = Router();
  router.use(json());

  router.post('/auth/corepass/session', (_req, res) => {
    const sessionId = store.createSession();
    const proxyCallback = process.env.COREPASS_CALLBACK_PROXY || '';
    const loginUri =
      'corepass:login/?sess=' + encodeURIComponent(sessionId) +
      '&conn=' + encodeURIComponent(proxyCallback) +
      '&type=callback';
    console.log('[corepass] session created:', sessionId);
    res.json({ ok: true, sessionId, loginUri });
  });

  router.get('/auth/corepass/callback', (_req, res) => {
    res.json({ ok: true, service: 'corepass-login-callback' });
  });

  router.post('/auth/corepass/callback', (req, res) => {
    const payload = req.body || {};
    const sess = String(payload.session || '');
    const coreId = String(payload.coreID || payload.coreId || '');
    console.log('[corepass] callback:', { sess: sess.slice(0, 8) + '…', coreId: coreId.slice(0, 12) + '…' });
    if (sess && coreId) {
      store.setAuthenticated(sess, coreId, coreId);
    }
    res.json({ ok: true, user: { id: coreId } });
  });

  router.get('/auth/corepass/session/:id', (req, res) => {
    const s = store.getSession(req.params.id);
    if (!s) {
      res.json({ ok: false, pending: false });
      return;
    }
    if (s.status !== 'authenticated') {
      res.json({ ok: true, pending: true, authenticated: false });
      return;
    }
    res.json({
      ok: true,
      pending: false,
      authenticated: true,
      address: s.address,
      coreId: s.coreId,
    });
  });

  router.options('/auth/corepass/callback', (_req, res) => {
    res.status(204).end();
  });

  return router;
}

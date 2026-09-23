const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const { createAdminHttpAuth } = require('./security');

function createHttpApp({
  adminHttpToken,
  getConnectionStatus,
  getLatestQR,
  aiEnabled,
  activeProvider,
  activeModelLabel,
  humanTakeoverMinutes,
  activeTakeoverCount,
  pingAI,
  aiMemoryTurns,
  aiRateMax,
  aiRateWindowMs,
  aiStats,
  botStats,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  const adminHttpAuth = createAdminHttpAuth(adminHttpToken);

  app.get('/', (_req, res) => {
    const provider = activeProvider();
    res.json({
      service: 'Yalla Delivery WhatsApp Bot 🛵',
      status: getConnectionStatus(),
      ai: {
        enabled: aiEnabled,
        provider,
        model: provider ? activeModelLabel(provider) : null,
      },
      humanTakeover: {
        enabled: true,
        durationMinutes: humanTakeoverMinutes,
        activeChats: activeTakeoverCount(),
      },
      time: new Date().toISOString(),
    });
  });

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  app.get('/ai-status', adminHttpAuth, async (req, res) => {
    try {
      const provider = activeProvider();
      const live = req.query.live === '1' || req.query.live === 'true';
      const ping = live
        ? await pingAI()
        : {
            ok: aiStats.lastOkAt != null,
            cached: true,
            reason: aiStats.lastError || null,
            lastOkAt: aiStats.lastOkAt,
          };

      res.json({
        enabled: aiEnabled,
        provider,
        geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
        groqKeyConfigured: Boolean(process.env.GROQ_API_KEY),
        model: provider ? activeModelLabel(provider) : null,
        memoryTurns: aiMemoryTurns,
        rateLimit: aiRateMax ? { max: aiRateMax, windowSec: aiRateWindowMs / 1000 } : null,
        stats: {
          totalCalls: aiStats.totalCalls,
          failures: aiStats.failures,
          lastOkAt: aiStats.lastOkAt,
          lastError: aiStats.lastError,
          lastErrorAt: aiStats.lastErrorAt,
        },
        groqLimits: provider === 'groq' ? aiStats.groqLimits : null,
        bot: { ...botStats, activeTakeovers: activeTakeoverCount() },
        ping,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/qr', adminHttpAuth, async (_req, res) => {
    if (getConnectionStatus() === 'connected') {
      return res.send('<h2 style="font-family:sans-serif">✅ البوت متصل بالفعل بواتساب.</h2>');
    }

    const latestQR = getLatestQR();
    if (!latestQR) {
      return res.send('<h2 style="font-family:sans-serif">⏳ لا يوجد QR حالياً. حدّث الصفحة بعد لحظات...</h2>');
    }

    qrcodeTerminal.generate(latestQR, { small: true }, (qrText) => {
      const escaped = String(qrText)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      res.send(
        `<div style="font-family:monospace;padding:20px;direction:ltr">
          <h2 style="font-family:sans-serif">📱 امسح QR من واتساب</h2>
          <pre style="font-size:10px;line-height:10px;white-space:pre">${escaped}</pre>
          <p style="font-family:sans-serif">الأجهزة المرتبطة ← ربط جهاز</p>
        </div>`,
      );
    });
  });

  return app;
}

module.exports = { createHttpApp };

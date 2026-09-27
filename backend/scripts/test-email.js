'use strict';

const { sendMail, isConfigured } = require('../src/services/email.service');

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npm run email:test -- recipient@example.com');
    process.exitCode = 2;
    return;
  }

  if (!isConfigured()) {
    console.error('SMTP is not configured. Check SMTP_USER and SMTP_PASS.');
    process.exitCode = 2;
    return;
  }

  const now = new Date().toISOString();
  const result = await sendMail({
    to,
    subject: 'اختبار بريد Yalla Delivery',
    text: `نجح إرسال البريد من خادم Yalla Delivery عبر Brevo SMTP. وقت الاختبار: ${now}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">
      <h2>Yalla Delivery</h2>
      <p>نجح إرسال البريد من خادم Yalla Delivery عبر Brevo SMTP ✅</p>
      <p style="color:#666">وقت الاختبار: ${now}</p>
    </div>`,
  });

  console.log('Email accepted by SMTP server:', result.accepted);
}

main().catch((err) => {
  console.error('Email test failed:', err.message);
  process.exitCode = 1;
});

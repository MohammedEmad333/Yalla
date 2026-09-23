/**
 * اختبار محادثة البوت محلياً بلا واتساب.
 * شغّله بـ:  node test-flow.js
 * اكتب رسائل كأنك العميل، وشاهد ردود البوت مباشرةً في الطرفية.
 * اكتب /exit للخروج.
 */
const readline = require('readline');
const { handleMessage } = require('./index');

const JID = 'tester@s.whatsapp.net';
const PHONE = '970000000000';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('🧪 وضع اختبار يلا ديلفري (بلا واتساب). اكتب رسالتك ثم Enter. للخروج: /exit\n');
console.log('جرّب مثلاً: مرحبا، طلب، 1، أسعار، دعم، التطبيق ما بفتح، أو بدي موظف.');
console.log('كلمة "طلب" يجب أن تعيد رابط التطبيق ولا تبدأ طلباً داخل واتساب.\n');

function ask() {
  rl.question('👤 أنت: ', async (line) => {
    const text = line.trim();
    if (text === '/exit') {
      rl.close();
      return;
    }
    try {
      const reply = await handleMessage(JID, PHONE, text);
      const replies = Array.isArray(reply) ? reply : [reply];
      for (const r of replies) {
        if (r) console.log('\n🤖 البوت:\n' + r + '\n');
      }
    } catch (e) {
      console.error('خطأ:', e.message);
    }
    ask();
  });
}

ask();

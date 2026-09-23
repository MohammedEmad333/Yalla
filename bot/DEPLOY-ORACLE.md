# 🟠 نشر بوت يلا ديلفري على Oracle Cloud (Always Free)

دليل كامل لإنشاء خادم جديد على Oracle والطبقة المجانية الدائمة، وتشغيل البوت
عليه 24/7 عبر **systemd** مع إعادة تشغيل تلقائية وجلسة واتساب دائمة.

> ✅ بعد هذا الإعداد: لو أُعيد تشغيل الخادم، أو انهار البوت، أو نفدت الذاكرة —
> يعيد systemd تشغيله تلقائياً، وتبقى جلسة الواتساب محفوظة بلا رمز اقتران جديد.

---

## لماذا توقّف البوت سابقاً؟ (باختصار)
1. لم يكن هناك مُشرف عملية (process manager) يعيد تشغيله بعد أي توقّف/انهيار.
2. مسار جلسة الواتساب كان نسبياً؛ أي تغيّر في دليل العمل يفقد الجلسة → طلب ربط جديد.
3. مكتبة Baileys قد تتقادم فيرفض واتساب الاتصال (خطأ 405) بعد تحديث البروتوكول.

هذا الدليل يعالج (1) و(2). أما (3) فبتحديث دوري بسيط (القسم 8).

---

## 1) إنشاء الخادم (Instance) على Oracle

1. ادخل **Oracle Cloud Console** ← القائمة ← **Compute → Instances → Create Instance**.
2. **Name:** `yalla-bot`.
3. **Image and shape → Edit:**
   - **Image:** Canonical **Ubuntu 22.04** (أو 24.04).
   - **Shape:** اختر شكلاً ضمن *Always Free*:
     - **VM.Standard.A1.Flex** (ARM) — الأفضل: اضبط **1 OCPU / 6 GB RAM** (ضمن الحد المجاني)، أو
     - **VM.Standard.E2.1.Micro** (AMD، 1 GB RAM) — يكفي البوت لكنه أضعف.
     > إن ظهر "Out of capacity" على ARM، جرّب لاحقاً أو استخدم شكل AMD Micro.
4. **Add SSH keys:** اختر **Generate a key pair for me** ونزّل المفتاح الخاص
   (`ssh-key-*.key`)، أو الصق مفتاحك العام. **احفظ المفتاح الخاص — لن يظهر ثانيةً.**
5. **Networking:** أبقِ الشبكة الافتراضية (Create new VCN) مع
   **Assign a public IPv4 address = Yes**.
6. اضغط **Create** وانتظر حتى تصبح الحالة **Running**، وانسخ **Public IP address**.

> ⚠️ **مهم — اسم المستخدم ومدير الحزم يختلفان حسب نظام التشغيل:**
> | النظام | مستخدم SSH | مدير الحزم |
> |--------|-----------|-----------|
> | **Ubuntu** | `ubuntu` | `apt` |
> | **Oracle Linux 9** (الصورة الافتراضية) | `opc` | `dnf` |
> اختر القسم المطابق لصورتك في الخطوات أدناه.

---

## 2) الاتصال بالخادم عبر SSH

من جهازك (استبدل المسار والـ IP، واسم المستخدم `ubuntu` أو `opc` حسب صورتك):
```bash
chmod 400 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>    # Ubuntu
ssh -i ~/Downloads/ssh-key-*.key opc@<PUBLIC_IP>       # Oracle Linux
```

---

## 3) تثبيت Node.js و git

**على Ubuntu:**
```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs git
node -v && npm -v      # تأكّد أن الإصدار ≥ 22
```

**على Oracle Linux 9:**
```bash
sudo dnf -y update
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs git
node -v && npm -v      # تأكّد أن الإصدار ≥ 22
```

---

## 3.5) ⚠️ مهم على E2.1.Micro (1 GB RAM): أنشئ ملف Swap

ذاكرة الميكرو 1 GB فقط، وقد يقتل النظام عملية Node عند الضغط (سبب توقّف صامت).
ملف swap بحجم 2 GB يمنع ذلك:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h        # تأكّد أن Swap أصبح 2.0Gi
```

---

## 4) سحب الكود وتثبيت الحزم

```bash
cd ~
git clone https://github.com/MohammedEmad333/Yalla.git
cd Yalla/bot
npm ci --omit=dev
```

---

## 5) الإعدادات (ملف `.env`)

```bash
cp .env.example .env
nano .env
```
اضبط على الأقل:
```
USE_PAIRING_CODE=true
BUSINESS_NUMBER=970593456405     # رقم واتساب الأعمال (دولي بلا +)
SUPPORT_NUMBER=+970593456405
APP_ANDROID_URL=<رابط أندرويد الحقيقي>
APP_WEB_URL=https://app.yalladelivery.org/
LOG_LEVEL=warn
ADMIN_HTTP_TOKEN=<قيمة-عشوائية-طويلة-32-محرف-على-الأقل>
```
احفظ بـ `Ctrl+O` ثم `Enter`، واخرج بـ `Ctrl+X`.

---

## 6) الربط بالواتساب لأول مرة (رمز اقتران — مرة واحدة)

شغّل البوت يدوياً لرؤية رمز الاقتران:
```bash
node index.js
```
سيظهر رمز من 8 خانات. على هاتف **رقم الأعمال**:
> واتساب ← **الأجهزة المرتبطة** ← **ربط جهاز** ← **ربط برقم الهاتف بدلاً من ذلك**
> ← أدخل الرمز **بسرعة** (خلال ~دقيقة).

عند ظهور **"✅ تم الاتصال بواتساب بنجاح"** تُحفظ الجلسة في `auth_info/`.
أوقف العملية بـ `Ctrl+C` (الجلسة تبقى محفوظة).

---

## 7) التشغيل الدائم 24/7 عبر systemd

انسخ وحدة الخدمة الجاهزة في المستودع، وفعّلها. وحدة الخدمة مضبوطة للمستخدم
`ubuntu`؛ **على Oracle Linux استخدم أمر `sed` الذي يبدّلها تلقائياً إلى `opc`**:

**على Ubuntu:**
```bash
sudo cp ~/Yalla/bot/deploy/yalla-bot.service /etc/systemd/system/yalla-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now yalla-bot
```

**على Oracle Linux (يبدّل `ubuntu`→`opc` في المستخدم والمسارات):**
```bash
sudo sed 's/ubuntu/opc/g' ~/Yalla/bot/deploy/yalla-bot.service \
  | sudo tee /etc/systemd/system/yalla-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now yalla-bot
```
تحقّق:
```bash
systemctl status yalla-bot          # يجب أن يكون active (running)
journalctl -u yalla-bot -f          # متابعة السجلّات لحظياً (Ctrl+C للخروج)
curl -s http://localhost:3000/health
```
> `enable` يجعله يبدأ تلقائياً عند إقلاع الخادم، و`Restart=always` يعيده بعد أي
> انهيار أو نفاد ذاكرة. لا حاجة لأي تدخّل يدوي بعد الآن.

---

## 8) تحديث الكود أو مكتبة Baileys لاحقاً

عند أي تحديث للكود، أو إذا رفض واتساب الاتصال (خطأ 405 / "حدّث تطبيقك"):
```bash
cd ~/Yalla/bot
git pull
npm ci --omit=dev
# لتحديث Baileys إلى أحدث إصدار عند الحاجة:
npm install @whiskeysockets/baileys@latest
sudo systemctl restart yalla-bot
journalctl -u yalla-bot -n 50 --no-pager
```
> `auth_info/` و`.env` لا يمسّهما `git pull` (كلاهما في `.gitignore`)، فالجلسة تبقى.

---

## 9) (اختياري) فتح المنفذ للوصول لصفحات الحالة من المتصفح

البوت يتصل بواتساب عبر اتصال صادر (لا يحتاج فتح منافذ). المنافذ تلزم فقط إن
أردت فتح `/`, `/qr`, `/ai-status` من متصفحك عبر الإنترنت. عندها:

**أ) قائمة أمان الشبكة في Oracle:** VCN ← Security List ← *Add Ingress Rule*:
Source `0.0.0.0/0`، Protocol TCP، Destination Port **3000**.

**ب) جدار Ubuntu الداخلي (Oracle يفعّله افتراضياً):**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```
ثم افتح `http://<PUBLIC_IP>:3000/`.
> للإنتاج يُفضّل **عدم كشف المنفذ 3000 للإنترنت**. المساران `/qr` و`/ai-status`
> محميان بـ `ADMIN_HTTP_TOKEN`، لكن الأفضل إبقاؤهما محليين والوصول عبر SSH tunnel أو Reverse Proxy مع HTTPS.

مثال فحص محمي من نفس الخادم:
```bash
curl -H "Authorization: Bearer $ADMIN_HTTP_TOKEN" http://127.0.0.1:3000/ai-status
# الفحص الحي المقصود فقط:
curl -H "Authorization: Bearer $ADMIN_HTTP_TOKEN" "http://127.0.0.1:3000/ai-status?live=1"
```

---

## أوامر تشخيص سريعة

| الغرض | الأمر |
|-------|-------|
| حالة الخدمة | `systemctl status yalla-bot` |
| السجلّات لحظياً | `journalctl -u yalla-bot -f` |
| آخر 100 سطر | `journalctl -u yalla-bot -n 100 --no-pager` |
| حالة اتصال الواتساب | `curl -s http://localhost:3000/health` |
| هل قُتلت العملية لنفاد الذاكرة؟ | `sudo dmesg | grep -i 'killed process'` |
| إعادة التشغيل يدوياً | `sudo systemctl restart yalla-bot` |
| إيقاف مؤقت | `sudo systemctl stop yalla-bot` |

> **إعادة الربط:** إذا سجّل الجهاز خروجاً من واتساب (حالة `loggedOut`)، يمسح البوت
> الجلسة ويخرج، فيعيد systemd تشغيله وهو ينتظر رمز اقتران جديد. راقب
> `journalctl -u yalla-bot -f`، خذ الرمز الجديد، وأعِد خطوة الربط (القسم 6) —
> هذه المرة دون إيقاف الخدمة، فقط أدخل الرمز الظاهر في السجلّات.

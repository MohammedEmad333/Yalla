# صورة تشغيل الـ Backend (Node.js + Express + Socket.io)
FROM node:20-alpine

WORKDIR /app

# نثبّت التبعيات أولًا للاستفادة من طبقات الكاش (تتغيّر أقل من الكود)
COPY package*.json ./
RUN npm install --omit=dev

# ثم ننسخ بقيّة الكود
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]

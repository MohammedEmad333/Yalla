# مرحلة 1: بناء تطبيق React باستخدام Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# عنوان الـ API يُحقن وقت البناء (متغيّرات Vite تُدمج في الحزمة)
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# مرحلة 2: تقديم الملفات الثابتة عبر nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

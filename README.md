# Tarot Fortune Web App

เว็บเปิดไพ่จากภาพสำรับ 78 ใบ เลือกเปิด 1, 2 หรือ 3 ใบ ไพ่ไม่ซ้ำจนกว่าจะครบสำรับ มีประวัติ, ค้นหา, Copy PNG และ Motion เปิดไพ่ทีละใบ

เวอร์ชันนี้ทำงานบน Vercel ทั้งระบบ:

- Guest เปิดไพ่ได้ทันทีโดยไม่ต้องล็อกอิน
- Beta user ล็อกอินด้วย Access Code รายบุคคล แล้วพิมพ์ถาม AI จากไพ่ที่เปิดจริง
- Admin จัดการผู้ทดสอบ, สิทธิ์, วันหมดอายุ, API key และสถิติได้ที่ /admin/
- Backend ใช้ Vercel Node.js Functions และ Neon serverless Postgres

## โครงสร้าง

- index.html, style.css, app.js — หน้าเปิดไพ่และ AI reader
- tarot-cards/ — ภาพไพ่ card-001.webp ถึง card-078.webp
- data/cards.json — คำบนไพ่ที่อ่านจาก artwork
- api/health.mjs, api/ai/tarot-chat.mjs และ catch-all routes ใน api/auth/ กับ api/admin/ — Vercel Functions (รวม 4 functions เพื่อใช้กับ Hobby plan)
- lib/vercel/ — database, session, security และ settings helpers
- admin/index.html, admin/admin.js — หน้าหลังบ้านแบบ static
- database/schema.vercel.sql — schema สำหรับ Neon Postgres
- api/**/*.php — ไฟล์เก่าที่ถูก .vercelignore กันไม่ให้ขึ้น Vercel

## Deploy บน Vercel

1. เชื่อม GitHub repository นี้กับ Vercel project แล้ว deploy branch main
2. จาก Vercel Marketplace เชื่อม Neon Postgres แล้วเพิ่ม environment variable DATABASE_URL
3. รัน database/schema.vercel.sql ใน Neon SQL Editor
4. เพิ่ม Environment Variables ใน Vercel:

   - DATABASE_URL — จาก Neon
   - SESSION_SECRET — random secret ยาวอย่างน้อย 32 ตัวอักษร
   - APP_ENCRYPTION_KEY — random secret สำหรับเข้ารหัส API key ที่เก็บในฐานข้อมูล
   - TAROT_BOOTSTRAP_SECRET — secret สำหรับสร้าง Admin คนแรก
   - OPENAI_API_KEY — ใส่ได้เป็น fallback แต่แนะนำให้กรอกผ่านหลังบ้าน
   - OPENAI_MODEL — รุ่นที่บัญชี API เปิดใช้ เช่น gpt-4.1-mini

5. Redeploy หลังเพิ่ม variables แล้วเปิด /admin/
6. ครั้งแรกกรอก First-time Setup เพื่อสร้าง Admin คนแรก จากนั้นล็อกอินด้วยอีเมล/รหัสผ่าน
7. ในหลังบ้านกรอก OpenAI API key และ model แล้วกดบันทึก
8. สร้าง Beta Tester ระบบจะแสดง Access Code เฉพาะครั้งนั้น ให้ส่ง code ให้ผู้ใช้รายบุคคล

ถ้าใช้คำสั่งสร้าง secret ใน PowerShell:

~~~powershell
$bytes = [byte[]](1..32 | ForEach-Object { Get-Random -Maximum 256 })
[Convert]::ToBase64String($bytes)
~~~

ใช้ค่าที่ได้เป็น APP_ENCRYPTION_KEY และสร้างค่า SESSION_SECRET/TAROT_BOOTSTRAP_SECRET ที่ไม่ซ้ำกัน

## การใช้งาน

1. Guest เปิดไพ่ 1/2/3 ใบได้เลย
2. ผู้ใช้ที่มี Beta Access Code กรอก code ในส่วน “ถามคำถามกับชุดไพ่”
3. หลังล็อกอินและเปิดไพ่แล้ว จะเห็นช่องพิมพ์คำถามและปุ่มถาม AI
4. AI เชื่อมคำบนไพ่ เช่น Worry, Relaxation หรือ Career Advancement กับคำถาม โดยตอบเป็นแนวทาง ไม่ฟันธงอนาคต

## API หลัก

- GET /api/health
- GET /api/auth/me
- POST /api/auth/beta-login
- POST /api/auth/logout
- POST /api/ai/tarot-chat
- POST /api/admin/bootstrap
- POST /api/admin/login, GET /api/admin/me, POST /api/admin/logout
- GET /api/admin/users, POST /api/admin/create-user, POST /api/admin/update-user
- GET/POST /api/admin/settings
- GET /api/admin/usage

## ความปลอดภัย

- API key ไม่อยู่ใน frontend และไม่ถูกคืนกลับไปที่ browser
- API key ที่บันทึกจากหลังบ้านถูกเข้ารหัสก่อนเก็บใน Postgres
- Session ใช้ HttpOnly/Secure signed cookie
- Admin mutation และ AI request ใช้ CSRF token
- จำกัดชื่อไฟล์ไพ่เฉพาะ 78 ใบจริง
- ไม่เก็บคำถาม/คำตอบเต็มโดยค่าเริ่มต้น
- Prompt AI กำชับให้ตอบอย่างอ่อนโยน ไม่ทำให้ผู้ใช้หวาดกลัว และไม่แทนผู้เชี่ยวชาญด้านสุขภาพ กฎหมาย การเงิน หรือความปลอดภัย

## Local development

โหมด Guest ที่ไม่ใช้ backend:

~~~powershell
python -m http.server 4173
~~~

เปิด http://localhost:4173 ได้ทันที ส่วน Beta/Admin/AI ต้องใช้ Vercel Functions พร้อม DATABASE_URL และ environment variables

คำสั่งตรวจสอบ:

~~~powershell
npm install
npm test
npm run check
~~~

## หมายเหตุ

Vercel Functions ถูกตรวจจากไฟล์ในโฟลเดอร์ api/ โดยอัตโนมัติ; ไฟล์เก่าที่ไม่ใช่ flow ของ Vercel จะไม่ถูก deploy. หากยังไม่ตั้งค่า Neon หรือ secret หน้า Guest ยังคงเปิดไพ่ได้ และหน้า AI จะแจ้งขั้นตอนตั้งค่าอย่างชัดเจนแทนการทำงานเงียบ ๆ

ใช้เพื่อความบันเทิงและการทบทวนตัวเอง ผู้ใช้เป็นคนตัดสินใจชีวิตของตัวเองเสมอ

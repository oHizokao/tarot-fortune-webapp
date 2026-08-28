# Tarot Fortune Web App

เว็บเปิดไพ่ดูดวงจากภาพสำรับ 78 ใบ เลือกเปิด 1, 2 หรือ 3 ใบ ไพ่ไม่ซ้ำจนกว่าจะครบสำรับ มีประวัติ ค้นหา Copy PNG และ Motion เปิดไพ่ทีละใบ

ระบบทำงานบน Vercel:

- Guest เปิดไพ่ได้ทันทีโดยไม่ต้องล็อกอิน
- `/login/` เป็นหน้าเข้าใช้งานของลูกค้า สมัครสมาชิกและเข้าใช้งานด้วย username + password
- `/ai/` เป็นห้องเปิดไพ่และพิมพ์คำถามให้ AI เชื่อมกับคำบนไพ่
- สมาชิกใหม่เริ่มเป็น `pending` จน Admin อนุมัติ และ Admin เปิดสิทธิ์ AI ให้เป็นรายคนได้
- `/admin/` เป็นหน้า Admin Landing และ Control Room โดยเฉพาะ แยกจากหน้าเข้าใช้งานของลูกค้า ใช้จัดการสมาชิก สิทธิ์ AI, API key, Prompt และสถิติ
- Backend ใช้ Vercel Node.js Functions และ Neon serverless Postgres

## โครงสร้าง

- `index.html`, `style.css`, `app.js` — หน้าเปิดไพ่ Guest และทางลัดไปห้องถาม AI
- `ai/` — หน้าเปิดไพ่สำหรับถาม AI พร้อมช่องคำถาม/คำตอบและ Motion
- `login/` — หน้าเข้าสู่ระบบและสมัครสมาชิก
- `admin/` — Admin Landing Page, login และ dashboard
- `tarot-cards/` — ภาพไพ่ `card-001.webp` ถึง `card-078.webp`
- `data/cards.json` — คำบนไพ่ที่ใช้ประกอบคำตอบ
- `api/` และ `lib/vercel/` — Vercel Functions, session, security และ settings
- `database/schema.vercel.sql` — schema สำหรับ Neon Postgres พร้อม migration จาก schema เดิม

## ตั้งค่า Vercel ครั้งแรก

1. เชื่อม GitHub repository นี้กับ Vercel project แล้ว deploy branch `main`
2. จาก Vercel Marketplace เชื่อม Neon Postgres แล้วเพิ่ม `DATABASE_URL`
3. รันไฟล์ `database/schema.vercel.sql` ใน Neon SQL Editor
4. เพิ่ม Environment Variables ใน Vercel:

   - `DATABASE_URL` — connection string จาก Neon
   - `SESSION_SECRET` — secret แบบสุ่มยาวอย่างน้อย 32 ตัวอักษร
   - `APP_ENCRYPTION_KEY` — secret สำหรับเข้ารหัส API key ในฐานข้อมูล
   - `TAROT_BOOTSTRAP_SECRET` — secret สำหรับสร้าง Admin คนแรก
   - `OPENAI_API_KEY` — fallback ได้ แต่แนะนำให้กรอกผ่านหลังบ้าน
   - `OPENAI_MODEL` — รุ่น API ที่บัญชีเปิดใช้ (ถ้าเว้นว่าง ระบบใช้ `gpt-5.6-luna`)

5. Redeploy แล้วเปิด `/admin/`
6. ในกล่อง First-time Setup ใส่ Setup secret, username (ค่าเริ่มต้นคือ `oHizokao`), ชื่อ และรหัสผ่านที่ต้องการใช้ จากนั้นกดสร้าง Admin คนแรก
7. เข้า `/admin/` และล็อกอินหลังบ้าน แล้วใส่ OpenAI API key/model รวมถึง Prompt หลักในส่วนตั้งค่า AI โดยแนะนำ `gpt-5.6-luna` สำหรับคำถามเปิดไพ่ 1–3 ใบ

รหัสผ่านของ Admin จะถูก hash ฝั่ง server และไม่ควรใส่ไว้ใน source code, HTML หรือ GitHub

## Flow สมาชิก

1. คนทั่วไปเปิดไพ่ได้ที่หน้าแรกโดยไม่ต้องมีบัญชี
2. ถ้าต้องการถาม AI ให้ไป `/login/` แล้วสมัครสมาชิก
3. สมาชิกใหม่จะเห็นสถานะรออนุมัติ
4. Admin เปิด `/admin/` เลือก “อนุมัติสมาชิก” ก่อน แล้วเลือก “เปิด AI 24 ชม.” หรือจัดการระยะเวลาตามต้องการ
5. สมาชิกเข้าใช้งานอีกครั้งที่ `/login/` แล้วเข้า `/ai/` เพื่อเลือกไพ่ พิมพ์คำถาม และรับคำตอบ

หน้า `/login/` รับเฉพาะบัญชีลูกค้า/สมาชิก หากใช้บัญชีผู้ดูแลต้องเข้า `/admin/` โดยตรง

ยังรองรับ Beta Access Code เดิมสำหรับ Tester ที่สร้างจากหลังบ้านด้วย

## API หลัก

- `GET /api/health`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/beta-login` (compatibility)
- `POST /api/auth/logout`
- `POST /api/ai/tarot-chat`
- `POST /api/admin/bootstrap`
- `POST /api/admin/login`, `GET /api/admin/me`, `POST /api/admin/logout`
- `GET /api/admin/users`, `POST /api/admin/create-user`, `POST /api/admin/update-user`
- `GET/POST /api/admin/settings`
- `GET /api/admin/usage`

## ความปลอดภัยและคำตอบ AI

- API key ไม่อยู่ใน frontend และไม่ถูกคืนกลับไปที่ browser
- API key ที่บันทึกจากหลังบ้านถูกเข้ารหัสก่อนเก็บใน Postgres
- Session ใช้ HttpOnly/Secure signed cookie
- Admin mutation และ AI request ใช้ CSRF token
- จำกัดชื่อไฟล์ไพ่เฉพาะ 78 ใบจริง และห้ามส่งไพ่ซ้ำในคำถามหนึ่งครั้ง
- Prompt AI ให้อ่านจากคำบนไพ่ที่เปิดจริง ตอบอย่างอ่อนโยน ไม่ฟันธงอนาคต และไม่ทำให้ผู้ใช้หวาดกลัว
- Memory ของห้อง AI เก็บคำถามตั้งต้นและคำตอบไว้ใน browser ของผู้ใช้สำหรับถามต่อจากไพ่ชุดเดิม; ปุ่มเริ่มเรื่องใหม่จะล้างบริบทนี้
- ถ้าคำถามเกี่ยวกับการแพทย์ กฎหมาย การเงิน ความปลอดภัย หรือการทำร้ายตัวเอง AI จะชวนติดต่อผู้เชี่ยวชาญหรือความช่วยเหลือที่เหมาะสม

## Local development

โหมด Guest ที่ไม่ใช้ backend:

```powershell
python -m http.server 4173
```

เปิด `http://localhost:4173` ได้ทันที ส่วนสมาชิก/Admin/AI ต้องมี Vercel Functions, Neon และ environment variables

คำสั่งตรวจสอบ:

```powershell
npm install
npm test
npm run check
```

ใช้เพื่อความบันเทิงและการทบทวนตัวเอง ผู้ใช้เป็นคนตัดสินใจชีวิตของตัวเองเสมอ

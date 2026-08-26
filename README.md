# Tarot Fortune Web App

เว็บแอปเปิดไพ่จากภาพในสำรับ 78 ใบ เลือกเปิด 1, 2 หรือ 3 ใบ ไพ่ไม่ซ้ำกันจนกว่าจะครบสำรับ มีประวัติชุดไพ่, ค้นหา, Copy เป็น PNG และ Motion เปิดไพ่ทีละใบ

ผู้ใช้ทั่วไปเปิดไพ่ได้ฟรีโดยไม่ต้องล็อกอิน ส่วน AI Tarot Reader ใช้ Beta Access Code และทำงานผ่าน PHP backend ที่เหมาะกับ Hostinger shared hosting

## โครงสร้างสำคัญ

- `index.html`, `style.css`, `app.js` — หน้าเว็บและระบบสุ่มไพ่ฝั่ง browser
- `tarot-cards/` — ภาพไพ่ 78 ใบ (`card-001.webp` ถึง `card-078.webp`)
- `data/cards.json` — คำภาษาอังกฤษที่ตรวจจาก label บนภาพไพ่ ใช้เป็นข้อมูลให้ AI เชื่อมกับคำถาม
- `api/` — PHP JSON API สำหรับ Beta login, AI, admin และการตั้งค่า
- `admin/` — หน้า `/admin/` สำหรับผู้ดูแล
- `database/schema.sql` — schema MySQL/MariaDB
- `scripts/create-admin.php` — สร้างบัญชีแอดมินครั้งแรกผ่าน SSH/CLI

## ใช้งานหน้าเปิดไพ่แบบไม่ใช้ backend

```powershell
python -m http.server 4173
```

เปิด `http://localhost:4173` ได้เลย ระบบสุ่มไพ่, ประวัติ, Copy PNG และ Motion ใช้ได้โดยไม่ต้องล็อกอิน

## ติดตั้งบน Hostinger ให้ AI ใช้งาน

ต้องใช้ PHP 8.0+ พร้อม PDO MySQL และ cURL

1. สร้าง MySQL database/user ใน hPanel แล้ว import `database/schema.sql` ผ่าน phpMyAdmin
2. อัปโหลด `index.html`, `style.css`, `app.js`, `tarot-cards/`, `data/`, `api/` และ `admin/` เข้า `public_html` โดยคงโครงสร้างโฟลเดอร์เดิม
3. คัดลอก `api/config/config.example.php` เป็น `api/config/config.php` แล้วแก้ค่า `db.dsn`, `db.username`, `db.password`
4. ตั้งค่า `OPENAI_API_KEY` และ `OPENAI_MODEL` ใน environment ของโฮสต์ถ้าทำได้ หรือใส่ใน `config.php`/`config.local.php` ที่ถูก ignore จาก Git โดยห้าม commit คีย์จริง
5. สร้างแอดมินครั้งแรกผ่าน SSH:

```bash
php scripts/create-admin.php "ชื่อแอดมิน" admin@example.com "รหัสผ่านยาวอย่างน้อย 10 ตัว"
```

6. เปิด `https://โดเมนของคุณ/admin/` ล็อกอิน แล้วใช้ช่อง OpenAI API key ในหลังบ้านได้ คีย์เดิมจะไม่ถูกแสดงกลับไปยัง browser
7. สร้าง Beta tester เลือกเวลา 3 ชั่วโมง, 12 ชั่วโมง, 24 ชั่วโมง, 3 วัน หรือ 7 วัน ระบบจะแสดง Access Code ให้คัดลอกครั้งเดียว

ถ้าโฮสต์ไม่มี SSH ให้รันสคริปต์นี้จากเครื่องที่ติดตั้ง PHP โดยตั้งค่า database ให้ชี้ไปยัง Hostinger หรือสร้าง admin hash ผ่านสภาพแวดล้อม PHP ที่ไว้ใจได้

## พฤติกรรม Beta และ AI

- หน้าเปิดไพ่ยังใช้งานได้เมื่อไม่มี session หรือไม่มี backend
- AI endpoint ตรวจ session, role, status และวันหมดอายุทุกครั้งก่อนเรียก OpenAI
- จำกัดคำขอเริ่มต้นประมาณ 6 ครั้งต่อนาทีต่อผู้ใช้ และ 60 ครั้งต่อชั่วโมง
- รับเฉพาะชื่อไฟล์ `card-001.webp` ถึง `card-078.webp` ป้องกัน path traversal
- ค่าเริ่มต้นไม่เก็บคำถาม/คำตอบฉบับเต็มลง `ai_usage` (`LOG_AI_CONTENT=false`)
- คำตอบใช้คำบนไพ่จริง เช่น `Worry`, `Relaxation`, `Career Advancement` เชื่อมกับคำถามเป็นมุมมองสะท้อนความคิด ไม่ฟันธงอนาคต
- Prompt กำชับให้ตอบอย่างอ่อนโยน ไม่ทำให้จิตตก ไม่แทนแพทย์/ทนาย/ที่ปรึกษาการเงิน และชวนหาความช่วยเหลือที่เหมาะสมเมื่อเป็นเรื่องความปลอดภัย
- `AI_USE_CARD_IMAGES=1` เป็นโหมดเสริมที่ส่งภาพไพ่เข้า AI เพิ่มเติม ใช้ token มากขึ้น; ค่าเริ่มต้นคือ metadata mode

## Endpoint หลัก

- `POST /api/auth/beta-login.php`
- `GET /api/auth/me.php`
- `POST /api/auth/logout.php`
- `POST /api/ai/tarot-chat.php`
- `POST /api/admin/login.php`
- `GET /api/admin/users.php`, `POST /api/admin/create-user.php`, `POST /api/admin/update-user.php`
- `GET/POST /api/admin/settings.php`
- `GET /api/admin/usage.php`

## ตรวจสอบก่อนเปิดจริง

- Guest: เปิด 1/2/3 ใบ, refresh, ประวัติ, ค้นหา, Copy PNG ทั้งมือถือและคอม
- New browser session: ไม่แสดงคำทำนายชุดเก่าค้างหน้า แต่ยังรักษาความคืบหน้าสำรับและประวัติไว้; ถ้าครบ 78 ใบจะเริ่มรอบใหม่อัตโนมัติ
- Beta: code ถูก, code ผิด, หมดอายุ, ถูกระงับ, logout และยิง AI เกิน rate limit
- Admin: login, สร้าง tester, ต่ออายุ, suspend/reactivate, revoke, สร้าง code ใหม่, ลบ และดู usage
- AI: คำตอบต้องอ้างคำบนไพ่ที่เปิดจริงและให้คำแนะนำที่ผู้ใช้เลือกทำต่อได้

## หมายเหตุเรื่อง Vercel

Vercel deployment แบบ static ใช้หน้าเปิดไพ่ได้ แต่ไม่รันไฟล์ PHP และไม่ควรเก็บ OpenAI key ไว้ใน static frontend ดังนั้นถ้าต้องการ AI/Beta/Admin ให้ชี้โดเมนไปยัง Hostinger ที่ติดตั้ง `api/` แล้ว ส่วน Vercel ใช้เป็น preview ของหน้าเปิดไพ่ได้

โปรเจกต์ Vercel preview เชื่อมกับ `oHizokao/tarot-fortune-webapp` แล้ว การ push เข้า branch `main` จะสร้าง deployment ใหม่อัตโนมัติสำหรับหน้า static

ใช้เพื่อความบันเทิงและการทบทวนตัวเอง ผู้ใช้เป็นคนตัดสินใจชีวิตของตัวเองเสมอ

# Production launch runbook

ใช้เอกสารนี้ก่อนเปิดให้ผู้ใช้จริง และทำซ้ำหลังเปลี่ยน schema, authentication หรือ AI integration

## 1. เตรียม Vercel และ Neon

1. เชื่อม GitHub repository กับ Vercel project โดยใช้ branch `main` และ Node.js 20
2. เชื่อม Neon Postgres แล้วใส่ `DATABASE_URL` ใน Vercel Production, Preview และ Development ตามที่ต้องการ
3. สร้าง secret แบบสุ่มและใส่ใน Vercel:
   - `SESSION_SECRET` — อย่างน้อย 32 ตัวอักษร
   - `APP_ENCRYPTION_KEY` — ค่า base64 ของ 32 bytes หรือข้อความสุ่มยาว
   - `TAROT_BOOTSTRAP_SECRET` — ใช้สร้าง Admin ครั้งแรก
   - `CRON_SECRET` — อย่างน้อย 32 ตัวอักษร
4. ใส่ `OPENAI_API_KEY` เป็น fallback หรือเว้นไว้เพื่อกรอกผ่าน `/admin/` หลัง deploy
5. ตั้ง `OPENAI_MODEL` ให้ตรงกับ model ที่ API account ใช้งานได้; ค่าเริ่มต้นของแอปคือ `gpt-5.6-luna`

ห้ามใส่ secret ใน GitHub, HTML, frontend JavaScript, issue หรือ screenshot

## 2. อัปเดต schema

รันจากเครื่องที่เข้าถึง Neon ได้ โดยใช้ค่า `DATABASE_URL` ของฐานข้อมูลเป้าหมาย:

```powershell
$env:DATABASE_URL = "<Neon connection string>"
npm ci
npm run migrate
```

ตรวจว่ามี migration `001_production_foundation` ใน `schema_migrations` แล้วจึง deploy code ที่ใช้ตารางใหม่ การรันซ้ำปลอดภัยเพราะ migration ที่ใช้แล้วจะถูกข้าม

## 3. Deploy และตรวจ readiness

หลัง deploy ให้ตรวจตามลำดับ:

1. เปิด `https://<deployment>/api/health` — ต้องมี `ready: true`, `database: true`, `schema: true`, `admin: true`, `ai: true`
2. เปิด `https://<deployment>/admin/`
3. ใช้ First-time Setup สร้าง Admin คนแรกด้วย `TAROT_BOOTSTRAP_SECRET` (ทำเฉพาะครั้งแรก)
4. ล็อกอินหลังบ้าน ตรวจ Diagnostics และกด “ทดสอบการเชื่อมต่อ”
5. บันทึก API key, model และ Prompt หลักผ่าน Settings เท่านั้น
6. ลบหรือ rotate `TAROT_BOOTSTRAP_SECRET` หลังสร้าง Admin สำเร็จ

ถ้า readiness ไม่เขียว ห้ามเปิด AI ให้ผู้ใช้ ให้แก้ environment/schema แล้วตรวจใหม่

## 4. ทดสอบ business flow

- Guest: เปิด 1, 2 และ 3 ใบได้โดยไม่ต้องล็อกอิน ไพ่ในรอบไม่ซ้ำและ reset กลับ 78 ใบ
- Member: สมัคร → Admin อนุมัติ → เข้าใช้งาน → เปิดไพ่ → พิมพ์คำถาม → รับคำตอบ → ถามต่อในชุดเดิม
- New reading: กด “ล้างไพ่ · ถามเรื่องใหม่” แล้ว Memory เดิมต้องไม่ถูกส่งต่อ
- Security: เปิด URL `/admin/` โดยไม่ล็อกอินต้องถูกปฏิเสธ และสมาชิกหนึ่งคนเปิด reading ของอีกคนไม่ได้
- Mobile: ทดสอบ viewport มือถือจริง ไม่มี horizontal overflow และปุ่ม/textarea ใช้งานได้

รันทดสอบอัตโนมัติบนเครื่อง:

```powershell
npm test
npm run check
npm run test:e2e
```

หรือเรียก GitHub Actions `Production smoke` โดยตั้ง secrets `E2E_TEST_USERNAME` และ `E2E_TEST_PASSWORD` เป็นบัญชีสมาชิกที่ Admin อนุมัติแล้วและมีโควตาเหลือ

## 5. Operations

- ใช้ `/admin/` ตั้งโควตารายวัน, revoke ทุก session, reset password และตรวจ audit log
- สมาชิกที่ได้รหัสชั่วคราวต้องเปลี่ยนรหัสผ่านก่อนใช้ AI
- Vercel Cron จะเรียก retention ทุกสัปดาห์ด้วย `CRON_SECRET` และลบ reading ที่ปิดเกิน 90 วัน, AI usage/audit เกิน 180 วัน และ rate-limit bucket เกิน 2 วัน
- หากผู้ใช้ขอลบบัญชี/ข้อมูล ให้ดำเนินการในฐานข้อมูลตามนโยบาย Privacy และเก็บหลักฐานการดำเนินการโดยไม่บันทึก secret

## 6. Rollback

1. หยุดการเปิดฟีเจอร์ใหม่จากหลังบ้านและบันทึกเวลา/commit ที่มีปัญหา
2. ใน Vercel เลือก deployment ล่าสุดที่ผ่าน smoke test แล้วกด Promote to Production
3. ห้าม rollback code ให้เก่ากว่า migration ที่สร้างตารางซึ่งฐานข้อมูลยังใช้งานอยู่ เว้นแต่ตรวจ compatibility แล้ว
4. ถ้าปัญหาเกิดจาก schema ให้แก้ด้วย migration ใหม่แบบ forward-only ไม่ใช้ `DROP TABLE` หรือ `git reset --hard`
5. ตรวจ `/api/health`, login, Guest draw และ member smoke อีกครั้ง แล้วบันทึกผลใน incident log

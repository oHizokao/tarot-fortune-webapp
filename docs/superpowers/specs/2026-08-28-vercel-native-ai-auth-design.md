# Vercel-Native AI Tarot and Access Design

## Goal

ให้โปรเจกต์ Tarot Fortune ทำงานบน Vercel ได้ครบในโดเมนเดียว: ผู้ใช้ทั่วไปเปิดไพ่ได้โดยไม่ล็อกอิน, ผู้ใช้ที่ได้รับ Beta Access Code ล็อกอินรายบุคคลและถาม AI จากไพ่ที่เปิดจริง, และผู้ดูแลสร้าง/ระงับ/ต่ออายุสิทธิ์รวมถึงตั้งค่า OpenAI ได้จาก /admin/.

## Root cause ที่แก้

เวอร์ชันเดิมมี PHP API อยู่ใน api/ แต่ deployment ปัจจุบันบน Vercel เป็น static deployment จึงส่งไฟล์ PHP ดิบกลับมาแทน JSON. #ai-question อยู่ใน member panel ที่มี hidden จนกว่าจะล็อกอินสำเร็จ ทำให้ Guest ไม่เห็นช่องพิมพ์ และ admin/index.php ไม่ใช่หน้า static ที่ Vercel เปิดใช้งานได้.

## Architecture

- Static UI: index.html, style.css, app.js, admin/index.html, admin/admin.js.
- Server: Vercel Node.js Functions ใน api/**/*.mjs; endpoint ใช้ same-origin path เช่น /api/auth/me.
- Database: Neon serverless Postgres ผ่าน @neondatabase/serverless, เชื่อมด้วย DATABASE_URL ของ Vercel Marketplace.
- Authentication: HttpOnly signed session cookie ที่ตรวจสถานะ/วันหมดอายุจากฐานข้อมูลทุก request. Beta Access Code ถูกเก็บเป็น bcrypt hash และใช้ได้กับผู้ใช้รายบุคคลที่ Admin สร้าง.
- Secrets: OPENAI_API_KEY ใช้จาก Vercel environment หรือค่าที่ Admin บันทึกแบบเข้ารหัสด้วย APP_ENCRYPTION_KEY; ห้ามส่ง key ไป browser และห้าม commit key.
- AI: Vercel Function เรียก OpenAI Responses API จาก server เท่านั้น รับคำถามและชื่อไฟล์ไพ่ที่เปิดจริง พร้อม metadata คำบนไพ่จาก data/cards.json.

## User flow

1. Guest เปิดไพ่ 1/2/3 ใบและดูประวัติได้ทันที.
2. ส่วน AI แสดงตัวอย่างช่องคำถามแบบล็อกไว้ให้ Guest เห็น พร้อมปุ่ม/ข้อความให้เข้าสู่ Beta.
3. Admin สร้าง Beta tester จาก /admin/; ระบบสร้าง code เฉพาะรายและแสดงให้คัดลอกครั้งเดียว.
4. ผู้ใช้กรอก code ที่หน้าแรก; login สำเร็จแล้วจึงเห็น textarea ที่ใช้งานได้และปุ่มถาม AI.
5. Function ตรวจ session, role, status, expiry, CSRF และไพ่ก่อนเรียก AI; คำตอบแสดงทีละบรรทัดพร้อม motion.

## API contract

- GET /api/health — ตรวจว่าฟังก์ชันทำงานและบอกเฉพาะสถานะการตั้งค่าแบบไม่เปิดเผย secret.
- GET /api/auth/me — { ok, authenticated, user, csrf_token }.
- POST /api/auth/beta-login — รับ { access_code }, คืน user และ csrf token.
- POST /api/auth/logout — ล้าง session cookie.
- POST /api/ai/tarot-chat — รับ { question, cards, conversation }, คืน { answer, cards, model }.
- POST /api/admin/bootstrap — สร้าง Admin คนแรกด้วย setup secret และปฏิเสธทันทีเมื่อมี Admin แล้ว.
- POST /api/admin/login, GET /api/admin/me, POST /api/admin/logout.
- GET /api/admin/users, POST /api/admin/create-user, POST /api/admin/update-user.
- GET/POST /api/admin/settings — อ่านสถานะ/บันทึก OpenAI model และ API key แบบเข้ารหัส.
- GET /api/admin/usage — สถิติการใช้งาน AI.

## Security and safety

- ใช้ HttpOnly, Secure, SameSite=Lax cookie; session payload ลงลายเซ็นด้วย SESSION_SECRET.
- Admin mutations และ AI request ใช้ CSRF token, ตรวจ Origin same-origin และ rate limit.
- Query ใช้ parameterized SQL; card filename whitelist จำกัดเฉพาะ card-001.webp ถึง card-078.webp.
- ไม่ log API key และไม่คืน key กลับ UI.
- AI prompt ใช้ถ้อยคำแนะแนว ไม่ฟันธงอนาคต ไม่วินิจฉัย และไม่ผลักให้ตัดสินใจที่เสี่ยงต่อชีวิต/การเงิน/สุขภาพ.

## Deployment requirements

Vercel project ต้องมี environment variables ต่อไปนี้ก่อนใช้สมาชิก/AI:

- DATABASE_URL — connection string จาก Neon integration.
- SESSION_SECRET — random secret ยาวอย่างน้อย 32 ตัวอักษร.
- APP_ENCRYPTION_KEY — random secret 32 bytes ในรูป base64 สำหรับเข้ารหัส API key ที่เก็บใน DB.
- TAROT_BOOTSTRAP_SECRET — secret ใช้สร้าง Admin คนแรกครั้งเดียว.
- OPENAI_API_KEY — optional fallback; Admin สามารถบันทึก key ผ่านหน้า settings หลัง database พร้อม.
- OPENAI_MODEL — optional default model เช่น gpt-5.4-mini.

ต้องรัน database/schema.vercel.sql ใน Neon SQL Editor ก่อนสร้าง Admin. การทดสอบ local ที่ไม่มี database จะต้องแสดง error ชัดเจนและยังคงให้ Guest เปิดไพ่ได้.

## Testing acceptance criteria

- Static Guest flow เปิด 1/2/3 ใบ, ไพ่ไม่ซ้ำ, clear reset, history, Copy PNG และ motion ยังผ่าน.
- Vercel Functions ตอบ JSON ไม่ใช่ source code และ GET /api/health ตอบได้เมื่อไม่มี database.
- admin/index.html เปิดบน /admin/ ได้โดยไม่พึ่ง PHP.
- Login สำเร็จ/ผิด/หมดอายุ/ระงับ, logout และการซ่อน/แสดง textarea ทำงานตามสิทธิ์.
- AI request ใช้เฉพาะไพ่ที่ส่งมา, ปฏิเสธคำถามว่าง/ไพ่ปลอม/ไม่มี session และไม่เผย API key.
- Desktop/mobile ไม่มี horizontal overflow และ answer/card motion ทำงานหรือเคารพ reduced-motion.

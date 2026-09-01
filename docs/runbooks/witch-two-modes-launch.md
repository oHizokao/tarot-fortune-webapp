# Witch Tarot two-mode launch checklist

เอกสารนี้ใช้ตรวจรุ่นที่ปรับ UX เป็นสองโหมดก่อน promote ขึ้น Vercel production

## สิ่งที่ผู้ใช้ต้องเห็น

- `/` แสดงสองทางเลือกชัดเจน: `เปิดไพ่ด้วยตัวเอง` และ `ถามแม่มด AI`
- Guest ใช้โหมดเปิดไพ่เองได้ทันที โดยไม่ต้องล็อกอิน
- `/ai/` เริ่มจากพิมพ์คำถาม → เลือกจำนวนไพ่ → เปิดไพ่ → รับคำตอบ
- สมาชิกที่ล็อกอินแล้วใช้ Memory ถามต่อในชุดไพ่เดิมได้
- `/admin/` เป็นหน้าแยกสำหรับผู้ดูแล ไม่ใช่หน้าล็อกอินลูกค้า

## ตรวจในเครื่อง

```powershell
npm ci
npm test
npm run check
npm run test:e2e
```

ให้เปิดตรวจด้วยตนเองที่ความกว้าง 390px, 768px และ 1440px:

1. หน้า `/` ไม่มี horizontal overflow และกดการ์ดทั้งสองใบได้
2. โหมด Guest เปิด 1, 2 และ 3 ใบ ไพ่ไม่ซ้ำจนกว่าจะกดล้างไพ่ และตัวนับกลับเป็น 78 ใบหลัง reset
3. หน้า `/ai/` แสดงช่องคำถามก่อนตัวเลือกจำนวนไพ่ ปุ่มเปิดไพ่ยัง disabled จนกว่าจะมีคำถาม
4. หลังเปิดไพ่ ภาพแม่มดและไพ่แสดง animation โดยไม่ทำให้เนื้อหาหลักหาย
5. `prefers-reduced-motion: reduce` ยังใช้งานได้และไม่มี animation ที่ไม่จำเป็น

## ตรวจบน Vercel preview

หลัง push branch ให้เปิด deployment preview และตรวจตามลำดับ:

```text
/
/ai/
/login/
/admin/
/api/health
```

`/api/health` ต้องรายงาน readiness ของ environment ที่ตั้งใจใช้งานจริงก่อนเปิด AI ให้สมาชิก

จากนั้นเข้า `/admin/` กด `ทดสอบการเชื่อมต่อ AI` ให้ผ่านจริงด้วย ถ้าได้ `AI_RATE_LIMITED` แม้ API key จะแสดงว่า “พร้อมใช้งาน” ให้ตรวจ Billing/Usage ของ OpenAI project เพราะ readiness ตรวจได้เพียงว่ามี key และ model ไม่ได้ยืนยันเครดิตของ upstream

ห้ามใส่ API key, password, session secret หรือ connection string ใน repository, screenshot หรือข้อความ commit

## Smoke test production

1. Guest เปิดไพ่จาก `/` ได้โดยไม่ล็อกอิน
2. ไป `/login/` แล้วสมัครหรือเข้าใช้งานด้วยบัญชีสมาชิกที่ได้รับอนุมัติ
3. จาก `/ai/` พิมพ์คำถาม เปิดไพ่ และรับคำตอบจาก AI
4. ถามต่อหนึ่งครั้งเพื่อยืนยัน Memory ของ reading เดิม
5. กด `ล้างไพ่ · ถามเรื่องใหม่` แล้วตรวจว่าชุดใหม่เริ่มจากไพ่ที่เหลือของรอบใหม่และไม่ส่งคำถามเดิมไปเป็นหัวข้อใหม่
6. เปิด `/admin/` ด้วยบัญชีผู้ดูแล ตรวจ Diagnostics, Prompt, model, quota และสิทธิ์ AI

## Rollback

หาก smoke test ไม่ผ่าน ให้หยุดการเปิด AI ชั่วคราว แล้วใช้ Vercel `Promote to Production` กับ deployment ล่าสุดที่ผ่านการตรวจ ไม่แก้ด้วยการลบหรือ reset ฐานข้อมูล ตรวจ `/api/health`, Guest draw และ member login หลัง rollback อีกครั้ง

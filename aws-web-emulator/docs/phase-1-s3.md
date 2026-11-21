# บันทึกการพัฒนา Amazon S3

**Phase 1 · ทดสอบ API ครบ · รอตรวจหน้าจอ AWS ที่ต้องมีทรัพยากร** · AWS Emulator 1.0.556, commit `c29ca200a147` · ตรวจวันที่ 22 พฤศจิกายน 2026

ทดสอบ 99 operations ที่ค้างจากรอบแรกครบแล้ว รวมเป็น **259 จาก 259 operations ที่มี handler** ใน 6 API models แต่ละ operation มีอย่างน้อยหนึ่งกรณีที่สำเร็จผ่าน emulator จริง ชุดทดสอบเทียบผลกับ inventory และรายงานล้มเหลวหากมี handler ที่ยังไม่มีกรณีสำเร็จ

## ผลทดสอบตาม API model

| Model | Operations ใน model | สำเร็จผ่าน emulator | Stub, ไม่มี handler หรือเลิกใช้ |
| --- | ---: | ---: | ---: |
| `s3` | 112 | 106 | 6 |
| `s3control` | 97 | 61 | 36 |
| `s3files` | 21 | 21 | 0 |
| `s3outposts` | 5 | 5 | 0 |
| `s3tables` | 49 | 46 | 3 |
| `s3vectors` | 21 | 20 | 1 |
| **รวม** | **305** | **259** | **46** |

กลุ่ม 46 operation ประกอบด้วย 44 stubs, `SelectObjectContent` ที่ไม่มี handler และ `GetObjectTorrent` ที่เลิกใช้ ชุดทดสอบยืนยันการปฏิเสธของเส้นทาง `SelectObjectContent` และ stub `ListAccessGrantsInstances` ด้วย

## ฟีเจอร์ที่ตรวจและปรับ

| หมวด | สิ่งที่ตรวจจาก AWS หรือทดสอบใน MyAWS |
| --- | --- |
| General purpose buckets และ Objects | เทียบรายการและหน้าสร้าง แก้ Versioning อัปโหลด และยืนยันลบจาก AWS Console จริง ทดสอบ object, ACL, analytics, replication, annotations, versioning, retention, legal hold, restore, KMS encryption, metadata configuration และ multipart copy ผ่าน emulator |
| Directory buckets | ทดสอบสร้าง bucket และ session แล้วอัปโหลด เปลี่ยนชื่อ ดาวน์โหลด และลบ |
| Batch Operations | เทียบลำดับ 4 ขั้นตอนของ Create Job ใน AWS Console ปรับ MyAWS ให้เลือก scope ใน Region ของ emulator เลือก operation ตั้ง options และตรวจสรุปก่อนสร้าง ทดสอบจนสร้าง job ผ่านเบราว์เซอร์ และทดสอบ priority, tags และการยกเลิกผ่าน emulator |
| Access Points และ Access Grants | เทียบ 4 แท็บของ Access Points ใน AWS Console ทดสอบ Access Point policy, tags, Access Grants policy และ scoped data credentials รวมถึง Multi-Region Access Point และ route updates |
| Storage Lens | เทียบแท็บ Dashboard และ Groups กับ AWS Console ทดสอบสร้าง แก้ไข และลบ dashboard configuration, tags และ group ผ่าน emulator |
| Table buckets และ Tables | เปิด Create table bucket จริง ตรวจชื่อ storage class, encryption และ tags เพิ่มแท็บ Properties, Permissions, Metrics และ Management ใน MyAWS ทดสอบสร้างและแก้ Request metrics ผ่านเบราว์เซอร์ และทดสอบ policy, maintenance, metadata pointer, record expiration, replication และผลที่อ่านกลับผ่าน API |
| Vector buckets | เทียบฟอร์ม Create vector bucket จริง เพิ่มฟอร์มชื่อ encryption และ tags ทดสอบทุก operation ที่มี handler รวมถึง policy, default index mode, ค้นหา vector และจัดการ index |
| File systems | เปิดฟอร์ม Create file system จริง ตรวจฟิลด์ bucket หรือ prefix เพิ่มฟอร์มสร้างใน MyAWS แล้วทดสอบสร้างผ่านเบราว์เซอร์ ทดสอบ mount targets, access points, synchronization, policies, tags และการลบผ่าน API |
| Outposts | ใช้ fixture ที่ provision S3 capacity ให้ Outpost ของบัญชีและ Outpost ที่แชร์มา ทดสอบสร้าง endpoint ทั้งสองแบบ อ่านรายการ shared endpoints และตรวจว่าลบแล้วหาย |
| Upload ไฟล์ใหญ่ | ทดสอบอัปโหลดไฟล์ 17 MiB จากเบราว์เซอร์ MyAWS แบ่งเป็นส่วนตามขนาดที่ bridge รับได้ และยืนยันขนาดรวมที่แสดงบนหน้า Objects |

เอกสาร AWS ที่ใช้เทียบขั้นตอน [Batch Job](https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops-create-job.html) · [แก้ Request metrics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-managing-cloudwatch-metrics.html) · [ตั้ง replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-replication-setting-up.html) · [ลบ Table bucket ผ่าน API](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-buckets-delete.html) · [ลบ File system](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-file-systems-deleting.html)

## สิ่งที่ต้องตรวจจาก AWS Console ก่อนเริ่ม VPC

- บัญชี AWS ที่เปิดให้อ้างอิงไม่มี Table bucket ใน Singapore หรือ N. Virginia จึงเปิดหน้าตั้งค่าของ Table bucket ที่มีอยู่เพื่อเทียบรายละเอียดใน Console จริงไม่ได้ หน้า Edit request metrics ของ MyAWS ใช้ขั้นตอนจากคู่มือ AWS และทดสอบกับ emulator แล้ว AWS ระบุการลบ Table bucket ผ่าน API, SDK หรือ CLI ส่วน MyAWS มีฟอร์มสำหรับเรียก API นี้
- ขั้นตอนที่ต้องเลือก File system, Storage Lens dashboard หรือ Batch Job ที่มีอยู่ เทียบได้จากเอกสาร AWS และทดสอบกับ emulator แล้ว ยังต้องเปิดทรัพยากรอ้างอิงจริงเพื่อตรวจหน้าจอเฉพาะเหล่านั้น
- งานที่อาศัยหลายบริการ เช่น การเชื่อม Glue ในฟอร์มสร้าง Table bucket และตัวเลือกการกำหนดค่าเชิงลึกของ Batch Job มีข้อแตกต่างจากหน้าจอ AWS โดย MyAWS ใช้ Region ของ emulator และฟอร์ม JSON สำหรับ input ซ้อนของบาง operation

S3 ผ่านเกณฑ์ทดสอบ API แล้ว งานเทียบหน้าจอข้างต้นยังเปิดอยู่ และรอบนี้ยังไม่ได้เริ่ม VPC

## ทดสอบซ้ำ

ใช้ emulator แยกที่พอร์ต `19297` และ Next.js ที่พอร์ต `13000` กับ state directory แยก ใช้ Region `us-east-1` ตั้งค่า environment ต่อไปนี้ใน **container ของ emulator ทดสอบ** เพื่อเตรียม Outposts ที่มี S3 capacity

```sh
S3_OUTPOSTS_PROVISIONED_OUTPOSTS="op-0a1b2c3d4e5f60718:52776558133248,op-2c3d4e5f607182930:24000000000000:111122223333:us-east-1"
```

จากโฟลเดอร์ `aws-web-emulator` รันชุดทดสอบโดยระบุ state directory ของ emulator ทดสอบเพื่อสร้าง KMS key fixture

```sh
MYAWS_S3_QA_STATE_DIR=/absolute/path/to/isolated-state/19297 node scripts/test-s3-console.mjs
```

[รายการ operations](../src/data/s3-operations.json) · [ชุดทดสอบ](../scripts/test-s3-console.mjs) · [แผนบริการทั้งหมด](service-roadmap.md)

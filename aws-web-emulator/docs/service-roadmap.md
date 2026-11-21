# แผนพัฒนา MyAWS Console ครบทุกบริการ

ขอบเขตของแผนคือ **230 กลุ่มบริการและ 436 API models** ที่ลงทะเบียนใน AWS Emulator commit `c29ca200a147` เพิ่มหน้า **Amazon VPC** แยกจาก **Amazon EC2** เพราะ Console ของ AWS มีทางเข้าแยกกัน รวมเป็น **231 หน้าบริการ** โดย VPC ยังใช้ model ของ EC2 สำหรับการเรียก API [รายการ API ในโปรเจกต์](../src/data/service-catalog.json) · [คู่มือ VPC](https://docs.aws.amazon.com/vpc/latest/userguide/view-vpc-resource-map.html) · [EC2 API สำหรับ DescribeVpcs](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeVpcs.html)

Phase 1 กำลังพัฒนา มี 5 หน้าที่เรียก emulator ได้แล้วในขอบเขตที่ระบุในแต่ละรายการ ทั้ง 5 หน้าต้องตรวจเทียบ AWS Console และเติมฟีเจอร์ API ให้ครบตามเกณฑ์ด้านล่าง ส่วน Phase 2–11 อยู่ในแผน คอลัมน์เริ่มและจบระบุลำดับทำงานของแต่ละ Phase

| Phase | ขอบเขต | เริ่ม | จบ | จำนวนหน้า |
| --- | --- | --- | --- | ---: |
| 1 | พื้นฐานการใช้งาน | Amazon S3 | AWS CloudTrail | 10 |
| 2 | เครือข่ายและการส่งเนื้อหา | Amazon Route 53 | Amazon Application Recovery Controller (ARC) | 13 |
| 3 | Compute คอนเทนเนอร์ และโครงสร้างพื้นฐาน | Amazon EBS | AWS Launch Wizard | 16 |
| 4 | ฐานข้อมูล พื้นที่จัดเก็บ และการย้ายระบบ | Amazon RDS | AWS Mainframe Modernization | 24 |
| 5 | การเชื่อมระบบและเครื่องมือนักพัฒนา | Amazon SNS | AWS Proton | 23 |
| 6 | ตัวตน การป้องกัน และการเข้ารหัส | AWS IAM Identity Center | AWS Artifact | 27 |
| 7 | การกำกับดูแล ปฏิบัติการ และค่าใช้จ่าย | AWS Account Management | AWS Support | 32 |
| 8 | ข้อมูล สตรีมมิง และการวิเคราะห์ | Amazon Kinesis Data Streams | Amazon Quick Sight | 18 |
| 9 | AI และ Machine Learning | Amazon Bedrock | AWS HealthOmics | 25 |
| 10 | IoT สื่อ เกม และโครงสร้างพื้นฐานเฉพาะทาง | AWS IoT Core | Amazon Managed Blockchain | 23 |
| 11 | แอปธุรกิจ การสื่อสาร และบริการผู้ใช้ปลายทาง | Amazon SES | AWS Partner Central | 20 |
| **รวม** | | | | **231** |

## เกณฑ์จบแต่ละบริการ

1. เปิด AWS Console จริงของบริการนั้นก่อนลงมือ ตรวจหน้าหลัก เมนูย่อย รายการและรายละเอียดทรัพยากร หน้าสร้างและแก้ไข เมนู Actions ขั้นตอนลบและหน้ายืนยัน รวมถึงการตั้งค่าและขั้นตอนเฉพาะของบริการ ตรวจชื่อปุ่ม ตำแหน่งที่ผู้ใช้เข้าถึง ฟิลด์ ค่าเริ่มต้น ข้อความ validation และลำดับการทำงาน การทดสอบที่เปลี่ยนข้อมูลให้ทำกับ emulator ในเครื่อง
2. ไล่ทุก operation ใน Smithy models ที่ลงทะเบียนของบริการ ทำรายการว่าฟีเจอร์ใดอยู่หน้าไหน ใช้ operation ใด และมีผลทดสอบอะไรบ้าง ฟีเจอร์ที่เรียกได้ผ่าน API อย่างเดียวให้มีจุดใช้งานในหน้าบริการตามลักษณะของฟีเจอร์นั้น
3. พัฒนาฟีเจอร์ทั้งหมดที่ API ของ emulator รองรับ โดยใช้ขั้นตอนจาก AWS Console เป็นอ้างอิง ให้ค้นและเปิดบริการจากเส้นทางของตัวเองและแสดงใน Recently visited เรียก API เดิมจาก frontend
4. ทดสอบแต่ละฟีเจอร์ผ่านหน้าเว็บกับ emulator ที่รันจริง ตรวจการเปลี่ยนแปลงหลังสร้าง แก้ไข และลบ รวมถึง loading, empty, error, pagination และ validation ตามที่เกี่ยวข้อง ใช้ข้อมูลทดสอบแยกจาก emulator ที่ใช้งานอยู่
5. บันทึก operation ที่ติดข้อจำกัดด้วยชื่อ model และผลที่ได้จริง เช่น emulator ตอบ `501` หรือยังตรวจไม่ได้เพราะต้องใช้โปรโตคอลเฉพาะ เก็บเป็นงานค้างโดยระบุสาเหตุ และปิดงานแต่ละฟีเจอร์เมื่อทดสอบผ่านแล้วเท่านั้น

เมื่อจบ Phase 11 ให้เทียบรายการครบ 230 กลุ่มกับ catalog ตรวจว่าทุก operation ของทั้ง 436 models มีผลตรวจ และตรวจเส้นทาง Search กับรายการเข้าล่าสุดทั้ง 231 หน้า รายงานฟีเจอร์ที่ผ่านแยกจากงานค้าง พร้อมระบุรุ่น emulator และเหตุผลที่ตรวจฟีเจอร์นั้นไม่ผ่าน

## รายการบริการตามลำดับพัฒนา

### Phase 1 พื้นฐานการใช้งาน

ตัวตนและสิทธิ์พื้นฐาน พื้นที่จัดเก็บ เครือข่าย เครื่องเสมือน คิว ฟังก์ชัน และการสังเกตระบบ

1. Amazon S3 (`s3`) · ทดสอบผ่านครบ 259 operations ที่มี handler จาก 6 API models รอตรวจหน้าจอ AWS สำหรับทรัพยากรที่ยังไม่มีในบัญชีอ้างอิง [บันทึกและผลทดสอบ S3](phase-1-s3.md)
2. Amazon VPC (`vpc`) · ใช้งานได้แล้วบางส่วน Your VPCs, Subnets, Route tables, Internet gateways และ Security groups พร้อมสร้าง IPv4 VPC
3. Amazon EC2 (`ec2`) · ใช้งานได้แล้วบางส่วน Instances, AMIs ที่บัญชีเป็นเจ้าของ, Volumes, Security groups, Key pairs และ Network interfaces
4. DynamoDB (`dynamodb`) · ใช้งานได้แล้วบางส่วน Tables และ Explore items พร้อมสร้างตารางและเพิ่ม item
5. Amazon SQS (`sqs`) · ใช้งานได้แล้วบางส่วน Queues และรายละเอียด พร้อมสร้างคิว ส่งและรับข้อความ
6. AWS Identity and Access Management (IAM) (`iam`)
7. AWS Security Token Service (STS) (`sts`)
8. AWS Lambda (`lambda`)
9. Amazon CloudWatch (`cloudwatch`)
10. AWS CloudTrail (`cloudtrail`)

### Phase 2 เครือข่ายและการส่งเนื้อหา

DNS, load balancer, CDN, การเชื่อมต่อเครือข่าย และการกู้คืนการรับส่งข้อมูล

1. Amazon Route 53 (`route53`)
2. Elastic Load Balancing (`elasticloadbalancing`)
3. Amazon CloudFront (`cloudfront`)
4. AWS Certificate Manager (`acm`)
5. AWS Global Accelerator (`globalaccelerator`)
6. AWS Cloud Map (`servicediscovery`)
7. Amazon VPC Lattice (`vpclattice`)
8. AWS Direct Connect (`directconnect`)
9. AWS Interconnect (`interconnect`)
10. AWS Network Manager (`networkmanager`)
11. AWS App Mesh (`appmesh`)
12. AWS RTB Fabric (`rtbfabric`)
13. Amazon Application Recovery Controller (ARC) (`arc`)

### Phase 3 Compute คอนเทนเนอร์ และโครงสร้างพื้นฐาน

Volumes, images, capacity, task, cluster และการนำแอปขึ้นรัน

1. Amazon EBS (`ebs`)
2. Amazon EC2 Auto Scaling (`autoscaling`)
3. Application Auto Scaling (`applicationautoscaling`)
4. EC2 Image Builder (`imagebuilder`)
5. Amazon ECR (`ecr`)
6. Amazon ECS (`ecs`)
7. Amazon EKS (`eks`)
8. AWS App Runner (`apprunner`)
9. AWS Batch (`batch`)
10. AWS Elastic Beanstalk (`elasticbeanstalk`)
11. AWS Amplify (`amplify`)
12. Amazon Lightsail (`lightsail`)
13. AWS Outposts (`outposts`)
14. AWS Parallel Computing Service (`pcs`)
15. Amazon Elastic VMware Service (`evs`)
16. AWS Launch Wizard (`launchwizard`)

### Phase 4 ฐานข้อมูล พื้นที่จัดเก็บ และการย้ายระบบ

ฐานข้อมูลและ backup, ระบบไฟล์, การถ่ายโอนข้อมูล และการย้าย workloads

1. Amazon RDS (`rds`)
2. Amazon Aurora DSQL (`dsql`)
3. Oracle Database@AWS (`odb`)
4. Amazon DocumentDB (`docdb`)
5. Amazon ElastiCache (`elasticache`)
6. Amazon MemoryDB (`memorydb`)
7. Amazon Neptune (`neptune`)
8. Amazon Keyspaces (`keyspaces`)
9. Amazon SimpleDB (`simpledbv2`)
10. Amazon Timestream (`timestream`)
11. Amazon Glacier (`glacier`)
12. Amazon EFS (`efs`)
13. Amazon FSx (`fsx`)
14. AWS Backup (`backup`)
15. AWS Storage Gateway (`storagegateway`)
16. AWS DataSync (`datasync`)
17. AWS Transfer Family (`transfer`)
18. AWS Snow Family (`snowball`)
19. AWS Database Migration Service (DMS) (`databasemigrationservice`)
20. AWS Application Discovery Service (`applicationdiscoveryservice`)
21. AWS Application Migration Service (`mgn`)
22. AWS Migration Hub (`migrationhub`)
23. AWS Elastic Disaster Recovery (`drs`)
24. AWS Mainframe Modernization (`m2`)

### Phase 5 การเชื่อมระบบและเครื่องมือนักพัฒนา

Events, workflow, API, repository และ CI/CD

1. Amazon SNS (`sns`)
2. Amazon EventBridge (`eventbridge`)
3. AWS Step Functions (`sfn`)
4. Amazon API Gateway (`apigateway`)
5. AWS AppSync (`appsync`)
6. Amazon MQ (`mq`)
7. Amazon Simple Workflow Service (SWF) (`swf`)
8. AWSServerlessApplicationRepository (`serverlessapplicationrepository`)
9. Amazon AppFlow (`appflow`)
10. AWS B2B Data Interchange (`b2bi`)
11. Amazon AppConfig (`appconfig`)
12. AWS CodeCommit (`codecommit`)
13. CodeArtifact (`codeartifact`)
14. AWS CodeConnections (`codeconnections`)
15. AWS CodeBuild (`codebuild`)
16. AWS CodeDeploy (`codedeploy`)
17. AWS CodePipeline (`codepipeline`)
18. AWS Developer Tools Notifications (`codestarnotifications`)
19. Amazon CodeGuru (`codeguru`)
20. Amazon CodeCatalyst (`codecatalyst`)
21. AWS Cloud9 (`cloud9`)
22. AWS Device Farm (`devicefarm`)
23. AWS Proton (`proton`)

### Phase 6 ตัวตน การป้องกัน และการเข้ารหัส

บัญชีผู้ใช้และแอป ใบรับรอง คีย์ การป้องกันเครือข่าย และการตอบสนองเหตุการณ์

1. AWS IAM Identity Center (`iam-identity-center`)
2. Amazon Cognito (`cognito`)
3. AWS Directory Service (`directoryservice`)
4. Amazon Cloud Directory (`clouddirectory`)
5. IAM Roles Anywhere (`rolesanywhere`)
6. Amazon Verified Permissions (`verifiedpermissions`)
7. AWS Sign-In Service (`signin`)
8. AWS Key Management Service (KMS) (`kms`)
9. AWS Secrets Manager (`secretsmanager`)
10. AWS CloudHSM (`cloudhsm`)
11. AWS Private CA (`acmpca`)
12. AWS Payment Cryptography (`paymentcryptography`)
13. AWS Signer (`signer`)
14. AWS WAF (`waf`)
15. AWS Shield (`shield`)
16. AWS Firewall Manager (`fms`)
17. AWS Network Firewall (`networkfirewall`)
18. AWS Network Security Manager Customer API (`networksecuritymanager`)
19. Amazon GuardDuty (`guardduty`)
20. Amazon Inspector (`inspector`)
21. Amazon Macie (`macie2`)
22. Amazon Detective (`detective`)
23. AWS SecurityHub (`securityhub`)
24. Amazon Security Lake (`securitylake`)
25. AWS Security Incident Response (`securityir`)
26. AWS Audit Manager (`auditmanager`)
27. AWS Artifact (`artifact`)

### Phase 7 การกำกับดูแล ปฏิบัติการ และค่าใช้จ่าย

โครงสร้างบัญชี การติดตั้ง infrastructure การปฏิบัติการ การสังเกตระบบ และต้นทุน

1. AWS Account Management (`account`)
2. AWS Organizations (`organizations`)
3. AWS Control Tower (`controltower`)
4. AWS Control Catalog (`controlcatalog`)
5. AWS Resource Access Manager (RAM) (`ram`)
6. AWS CloudFormation (`cloudformation`)
7. AWS Cloud Control API (`cloudcontrol`)
8. AWS Config (`configservice`)
9. AWS Systems Manager (`ssm`)
10. AWS Service Catalog (`servicecatalog`)
11. Service Quotas (`servicequotas`)
12. AWS Resource Groups (`resourcegroups`)
13. AWS Resource Explorer (`resourceexplorer2`)
14. AWS X-Ray (`xray`)
15. Amazon Managed Grafana (`grafana`)
16. Amazon Managed Service for Prometheus (`amp`)
17. AWS Compute Optimizer (`computeoptimizer`)
18. Amazon DevOps Guru (`devopsguru`)
19. AWS DevOps Agent Service (`devopsagent`)
20. AWS Fault Injection Service (`fis`)
21. AWS Resilience Hub (`resiliencehub`)
22. AWS Health (`health`)
23. AWS User Notifications (`notifications`)
24. Amazon Q Developer in chat applications (`chatbot`)
25. AWS Well-Architected Tool (`wellarchitected`)
26. AWS License Manager (`licensemanager`)
27. AWS Trusted Advisor (`trustedadvisor`)
28. AWS Billing and Cost Management (`billing`)
29. AWS Billing Conductor (`billingconductor`)
30. AWS Application Cost Profiler (`applicationcostprofiler`)
31. AWS User Experience Customization (`uxc`)
32. AWS Support (`support`)

### Phase 8 ข้อมูล สตรีมมิง และการวิเคราะห์

Streams, search, data pipelines, warehouse และการกำกับดูแลข้อมูล

1. Amazon Kinesis Data Streams (`kinesis`)
2. Amazon Data Firehose (`firehose`)
3. Amazon Managed Streaming for Apache Kafka (MSK) (`kafka`)
4. Amazon Managed Service for Apache Flink (`kinesisanalytics`)
5. AWS Glue (`glue`)
6. AWS Lake Formation (`lakeformation`)
7. Amazon Athena (`athena`)
8. Amazon EMR (`emr`)
9. Amazon Redshift (`redshift`)
10. Amazon OpenSearch Service (`opensearch`)
11. Amazon CloudSearch (`cloudsearch`)
12. Amazon Managed Workflows for Apache Airflow (MWAA) (`mwaa`)
13. AWS Data Pipeline (`datapipeline`)
14. Amazon DataZone (`datazone`)
15. AWS Data Exchange (`dataexchange`)
16. AWS Clean Rooms (`cleanrooms`)
17. AWS EntityResolution (`entityresolution`)
18. Amazon Quick Sight (`quicksight`)

### Phase 9 AI และ Machine Learning

โมเดลและ agents, การประมวลผลข้อความ สื่อ และข้อมูลสุขภาพ

1. Amazon Bedrock (`bedrock`)
2. Amazon Bedrock AgentCore (`bedrockagentcore`)
3. AWS Agent Registry (`agentregistry`)
4. Amazon SageMaker AI (`sagemaker`)
5. Amazon Augmented AI (`sagemakera2iruntime`)
6. Amazon Nova Act (`novaact`)
7. Amazon Q Business (`qbusiness`)
8. AWSKendraFrontendService (`kendra`)
9. Amazon Machine Learning (`machinelearning`)
10. Amazon Forecast Service (`forecast`)
11. Amazon Fraud Detector (`frauddetector`)
12. Amazon Personalize (`personalize`)
13. Amazon Lex (`lex`)
14. Amazon Polly (`polly`)
15. Amazon Transcribe Service (`transcribe`)
16. Amazon Translate (`translate`)
17. Amazon Comprehend (`comprehend`)
18. Amazon Comprehend Medical (`comprehendmedical`)
19. Amazon Textract (`textract`)
20. Amazon Rekognition (`rekognition`)
21. Amazon Lookout for Equipment (`lookoutequipment`)
22. Amazon Connect Health (`connecthealth`)
23. AWS HealthImaging (`medicalimaging`)
24. Amazon HealthLake (`healthlake`)
25. AWS HealthOmics (`omics`)

### Phase 10 IoT สื่อ เกม และโครงสร้างพื้นฐานเฉพาะทาง

อุปกรณ์และ edge, วิดีโอและสื่อ, เกม, ตำแหน่ง และการประมวลผลเฉพาะทาง

1. AWS IoT Core (`iot`)
2. AWS IoT Device Management (`iot-device-management`)
3. AWS Greengrass (`greengrass`)
4. AWS IoT FleetWise (`iotfleetwise`)
5. AWS IoT SiteWise (`iotsitewise`)
6. AWS IoT Things Graph (`iotthingsgraph`)
7. AWS IoT TwinMaker (`iottwinmaker`)
8. Amazon Kinesis Video Streams (`kinesisvideo`)
9. Amazon Interactive Video Service (IVS) (`ivs`)
10. AWS MediaConnect (`mediaconnect`)
11. AWS Elemental MediaConvert (`mediaconvert`)
12. AWS Elemental MediaLive (`medialive`)
13. AWS Elemental MediaPackage (`mediapackage`)
14. AWS Elemental MediaStore (`mediastore`)
15. AWS MediaTailor (`mediatailor`)
16. AWS Elemental Inference (`elementalinference`)
17. AWS Deadline Cloud (`deadline`)
18. Amazon GameLift Servers (`gamelift`)
19. Amazon GameLift Streams (`gameliftstreams`)
20. Amazon Location Service (`location`)
21. AWS Ground Station (`groundstation`)
22. Braket (`braket`)
23. Amazon Managed Blockchain (`managedblockchain`)

### Phase 11 แอปธุรกิจ การสื่อสาร และบริการผู้ใช้ปลายทาง

การสื่อสารและติดต่อกับลูกค้า เดสก์ท็อปจัดการจากส่วนกลาง และการใช้งานขององค์กร

1. Amazon SES (`ses`)
2. AWS End User Messaging (`endusermessaging`)
3. Amazon Pinpoint (`pinpoint`)
4. Amazon Connect (`connect`)
5. Amazon Chime (`chime`)
6. Amazon Chime SDK (`chime-sdk`)
7. AWS Wickr Admin API (`wickr`)
8. Amazon WorkMail (`workmail`)
9. Amazon WorkDocs (`workdocs`)
10. Amazon WorkSpaces (`workspaces`)
11. Amazon WorkSpaces Applications (`appstream`)
12. Amazon WorkSpaces Secure Browser (`workspacesweb`)
13. Amazon WorkSpaces Thin Client (`workspacesthinclient`)
14. AppFabric (`appfabric`)
15. AWS Supply Chain (`supplychain`)
16. AWS Continuum (`continuum`)
17. Amazon Mechanical Turk (`mturk`)
18. AWS re:Post Private (`repostspace`)
19. AWS Marketplace (`marketplace`)
20. AWS Partner Central (`partner-central`)

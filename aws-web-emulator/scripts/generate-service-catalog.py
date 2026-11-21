#!/usr/bin/env python3
"""Build the MyAWS service search catalog from the neighboring AWS Emulator checkout."""

import json
import re
import subprocess
import tomllib
from collections import defaultdict
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
EMULATOR = APP.parent / "aws-emulator"

# Combine control planes, features, and earlier names under their service.
# First token is the catalog slug. It can also be a model namespace.
FAMILIES = """
account accountaccess accountaccessruntime
acmpca pcaconnectorad pcaconnectorscep
agentregistry agentregistrycontrol
amplify amplifybackend amplifyuibuilder
apigateway apigatewaymanagementapi apigatewayv2
appconfig appconfigdata
applicationautoscaling autoscalingplans
arc arcregionswitch arczonalshift route53recoverycluster route53recoverycontrolconfig route53recoveryreadiness
backup backupgateway backupsearch
billing bcmdashboards bcmdataexports bcmpricingcalculator bcmrecommendedactions budgets costandusagereportservice costexplorer costoptimizationhub freetier invoicing pricing pricingplanmanager savingsplans sustainability taxsettings
bedrock bedrockagent bedrockagentruntime bedrockdataautomation bedrockdataautomationruntime bedrockruntime
bedrockagentcore bedrockagentcorecontrol
chime-sdk chimesdkidentity chimesdkmediapipelines chimesdkmeetings chimesdkmessaging chimesdkvoice
cleanrooms cleanroomsml
cloudfront cloudfrontkeyvaluestore
cloudhsm cloudhsmv2
cloudsearch cloudsearchdomain
cloudtrail cloudtraildata
cloudwatch aiops applicationinsights applicationsignals cloudwatchlogs cloudwatchomni internetmonitor networkflowmonitor networkmonitor oam observabilityadmin rum synthetics
codeconnections codestarconnections
codeguru codeguruprofiler codegurureviewer codegurusecurity
cognito cognitoidentity cognitoidentityprovider cognitosync
computeoptimizer computeoptimizerautomation
connect appintegrations connectcampaigns connectcampaignsv2 connectcases connectcontactlens connectparticipant customerprofiles qconnect voiceid wisdom
continuum securityagent
directoryservice directoryservicedata
docdb docdbelastic
dynamodb dax dynamodbstreams
ebs dlm rbin
ec2 ec2instanceconnect
ecr ecrpublic
eks eksauth
elasticloadbalancing elasticloadbalancingv2
emr emrcontainers emrserverless
endusermessaging pinpointsmsvoice pinpointsmsvoicev2 socialmessaging
eventbridge cloudwatchevents eventbridgev2 pipes scheduler schemas
forecast forecastquery
glue databrew
greengrass greengrassv2
iam accessanalyzer iamtoolbox
iam-identity-center identitystore sso ssoadmin ssooidc
inspector inspector2 inspectorscan
iot iotdataplane iotdeviceadvisor iotwireless
iot-device-management iotjobsdataplane iotmanagedintegrations iotsecuretunneling
ivs ivschat ivsrealtime
kafka kafkaconnect
kendra kendraranking
keyspaces keyspacesstreams
kinesisanalytics kinesisanalyticsv2
kinesisvideo kinesisvideoarchivedmedia kinesisvideomedia kinesisvideosignaling kinesisvideowebrtcstorage
lambda lambdacore lambdamicrovms lambdaweb
lex lexmodelbuildingservice lexmodelsv2 lexruntimeservice lexruntimev2
licensemanager licensemanagerlinuxsubscriptions licensemanagerusersubscriptions
location geomaps geoplaces georoutes
managedblockchain managedblockchainquery
marketplace marketplaceagreement marketplacecatalog marketplacecommerceanalytics marketplacedeployment marketplacediscovery marketplaceentitlementservice marketplacemetering marketplacereporting
mediapackage mediapackagev2 mediapackagevod
mediastore mediastoredata
migrationhub migrationhubconfig migrationhuborchestrator migrationhubrefactorspaces migrationhubstrategy
mwaa mwaaserverless
neptune neptunedata neptunegraph
notifications notificationscontacts
opensearch elasticsearchservice opensearchserverless osis
organizations mpa
partner-central partnercentralaccount partnercentralbenefits partnercentralchannel partnercentralrevenuemeasurement partnercentralselling
paymentcryptography paymentcryptographydata
personalize personalizeevents personalizeruntime
pinpoint pinpointemail
qbusiness qapps
rds pi rdsdata
redshift redshiftdata redshiftserverless
resiliencehub resiliencehubv2
resourcegroups resourcegroupstaggingapi
route53 route53domains route53globalresolver route53profiles route53resolver
s3 s3control s3files s3outposts s3tables s3vectors
sagemaker sagemakeredge sagemakerfeaturestoreruntime sagemakergeospatial sagemakerjobruntime sagemakermetrics sagemakerruntime sagemakerruntimehttp2 sagemakertrainingsessionruntime
servicecatalog servicecatalogappregistry
ses sesv2 mailmanager
signer signerdata
snowball snowdevicemanagement
ssm ssmcontacts ssmguiconnect ssmincidents ssmquicksetup ssmsap
support supportapp supportauthz
timestream timestreaminfluxdb timestreamquery timestreamwrite
transcribe transcribestreaming
waf wafregional wafv2
workmail workmailmessageflow
workspaces workspacesinstances
"""

# Service names shown in the console when a Smithy title is a protocol or SDK name.
DISPLAY_NAMES = dict(row.split("|", 1) for row in """
account|AWS Account Management
acmpca|AWS Private CA
agentregistry|AWS Agent Registry
amp|Amazon Managed Service for Prometheus
apigateway|Amazon API Gateway
appflow|Amazon AppFlow
appstream|Amazon WorkSpaces Applications
arc|Amazon Application Recovery Controller (ARC)
autoscaling|Amazon EC2 Auto Scaling
b2bi|AWS B2B Data Interchange
bedrock|Amazon Bedrock
bedrockagentcore|Amazon Bedrock AgentCore
billing|AWS Billing and Cost Management
billingconductor|AWS Billing Conductor
chatbot|Amazon Q Developer in chat applications
chime-sdk|Amazon Chime SDK
cleanrooms|AWS Clean Rooms
cloudcontrol|AWS Cloud Control API
clouddirectory|Amazon Cloud Directory
cloudformation|AWS CloudFormation
cloudhsm|AWS CloudHSM
cloudwatch|Amazon CloudWatch
codeguru|Amazon CodeGuru
codestarnotifications|AWS Developer Tools Notifications
cognito|Amazon Cognito
comprehendmedical|Amazon Comprehend Medical
configservice|AWS Config
connect|Amazon Connect
connecthealth|Amazon Connect Health
databasemigrationservice|AWS Database Migration Service (DMS)
deadline|AWS Deadline Cloud
docdb|Amazon DocumentDB
drs|AWS Elastic Disaster Recovery
dsql|Amazon Aurora DSQL
dynamodb|DynamoDB
ebs|Amazon EBS
ec2|Amazon EC2
ecr|Amazon ECR
ecs|Amazon ECS
efs|Amazon EFS
eks|Amazon EKS
elasticloadbalancing|Elastic Load Balancing
emr|Amazon EMR
endusermessaging|AWS End User Messaging
eventbridge|Amazon EventBridge
evs|Amazon Elastic VMware Service
firehose|Amazon Data Firehose
fis|AWS Fault Injection Service
fms|AWS Firewall Manager
gamelift|Amazon GameLift Servers
glacier|Amazon Glacier
glue|AWS Glue
grafana|Amazon Managed Grafana
health|AWS Health
iam|AWS Identity and Access Management (IAM)
iam-identity-center|AWS IAM Identity Center
imagebuilder|EC2 Image Builder
inspector|Amazon Inspector
interconnect|AWS Interconnect
iot|AWS IoT Core
iot-device-management|AWS IoT Device Management
ivs|Amazon Interactive Video Service (IVS)
kafka|Amazon Managed Streaming for Apache Kafka (MSK)
keyspaces|Amazon Keyspaces
kinesis|Amazon Kinesis Data Streams
kinesisanalytics|Amazon Managed Service for Apache Flink
kinesisvideo|Amazon Kinesis Video Streams
kms|AWS Key Management Service (KMS)
lambda|AWS Lambda
lex|Amazon Lex
location|Amazon Location Service
m2|AWS Mainframe Modernization
macie2|Amazon Macie
managedblockchain|Amazon Managed Blockchain
marketplace|AWS Marketplace
medicalimaging|AWS HealthImaging
mgn|AWS Application Migration Service
mq|Amazon MQ
mturk|Amazon Mechanical Turk
mwaa|Amazon Managed Workflows for Apache Airflow (MWAA)
neptune|Amazon Neptune
networkmanager|AWS Network Manager
novaact|Amazon Nova Act
odb|Oracle Database@AWS
omics|AWS HealthOmics
opensearch|Amazon OpenSearch Service
organizations|AWS Organizations
partner-central|AWS Partner Central
paymentcryptography|AWS Payment Cryptography
pinpoint|Amazon Pinpoint
qbusiness|Amazon Q Business
quicksight|Amazon Quick Sight
ram|AWS Resource Access Manager (RAM)
rds|Amazon RDS
route53|Amazon Route 53
rtbfabric|AWS RTB Fabric
s3|Amazon S3
sagemaker|Amazon SageMaker AI
sagemakera2iruntime|Amazon Augmented AI
securityir|AWS Security Incident Response
ses|Amazon SES
sfn|AWS Step Functions
shield|AWS Shield
simpledbv2|Amazon SimpleDB
snowball|AWS Snow Family
sns|Amazon SNS
sqs|Amazon SQS
ssm|AWS Systems Manager
sts|AWS Security Token Service (STS)
supplychain|AWS Supply Chain
swf|Amazon Simple Workflow Service (SWF)
timestream|Amazon Timestream
transfer|AWS Transfer Family
trustedadvisor|AWS Trusted Advisor
uxc|AWS User Experience Customization
waf|AWS WAF
wellarchitected|AWS Well-Architected Tool
workspaces|Amazon WorkSpaces
workspacesweb|Amazon WorkSpaces Secure Browser
xray|AWS X-Ray
""".strip().splitlines())

KEYWORDS = {
    "dynamodb": ["NoSQL database"],
    "ec2": ["virtual machines", "instances"],
    "ecr": ["container registry"],
    "iam": ["identity and access management"],
    "rds": ["relational database"],
    "s3": ["object storage", "buckets"],
    "sqs": ["message queues"],
}


def read_models():
    router = (EMULATOR / "core/router/src/lib.rs").read_text()
    registered = set(re.findall(r"router\.register_service\((service_\w+)::EmulatedService::new", router))
    members = tomllib.loads((EMULATOR / "Cargo.toml").read_text())["workspace"]["members"]
    models = {}
    for member in members:
        if member.rsplit("/", 1)[-1].replace("-", "_") not in registered:
            continue
        matches = [
            (name, shape["traits"])
            for file in (EMULATOR / member / "smithy-model").glob("*.json")
            for name, shape in json.loads(file.read_text())["shapes"].items()
            if shape["type"] == "service"
        ]
        if len(matches) != 1:
            raise ValueError(f"Expected one service model in {member}")
        name, traits = matches[0]
        identifier = name.split("#")[0].removeprefix("com.amazonaws.")
        if identifier in models:
            raise ValueError(f"Duplicate service model {identifier}")
        aws = traits["aws.api#service"]
        models[identifier] = {
            "id": identifier,
            "name": aws["sdkId"],
            "title": traits["smithy.api#title"],
        }
    if not models or len(models) != len(registered):
        raise ValueError("Service metadata does not match the router registrations")
    return models


def main():
    models = read_models()
    families = {}
    for row in FAMILIES.strip().splitlines():
        family, *features = row.split()
        for identifier in features:
            # Some models can be retired in later emulator releases.
            if identifier not in models:
                continue
            if identifier in families:
                raise ValueError(f"Duplicate mapping for {identifier}")
            families[identifier] = family
    grouped = defaultdict(list)
    for identifier, model in sorted(models.items()):
        grouped[families.get(identifier, identifier)].append(model)

    catalog = []
    for identifier, entries in grouped.items():
        primary = models.get(identifier, entries[0])
        name = DISPLAY_NAMES.get(identifier, primary["title"])
        aliases = set(KEYWORDS.get(identifier, []))
        for entry in entries:
            aliases.update([entry["id"], entry["name"], entry["title"]])
        aliases.discard(name)
        catalog.append({
            "id": identifier,
            "name": name,
            "aliases": sorted(aliases, key=lambda alias: (alias.casefold(), alias)),
            "models": [{"id": item["id"], "name": item["name"]} for item in entries],
        })
    catalog.sort(key=lambda service: re.sub(r"^(Amazon|AWS) ", "", service["name"]).casefold())
    commit = subprocess.check_output(["git", "-C", str(EMULATOR), "rev-parse", "HEAD"], text=True).strip()
    result = {"commit": commit, "services": catalog}
    path = APP / "src/data/service-catalog.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Generated {len(catalog)} services from {len(models)} models at {commit[:7]}")


if __name__ == "__main__":
    main()

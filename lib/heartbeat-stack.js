const lambda = require("aws-cdk-lib/aws-lambda")
const events = require("aws-cdk-lib/aws-events")
const targets = require("aws-cdk-lib/aws-events-targets")
const dynamodb = require("aws-cdk-lib/aws-dynamodb")
const { Duration, Stack, RemovalPolicy } = require("aws-cdk-lib")
const { RetentionDays } = require("aws-cdk-lib/aws-logs")
const { Topic } = require("aws-cdk-lib/aws-sns")
const { EmailSubscription } = require("aws-cdk-lib/aws-sns-subscriptions")

const config = require("../config")

const ACCOUNT_SETTINGS = {
    region: "us-west-2",
}
const HEARTBEAT_OFFLINE_TABLE_NAME = "OfflineHeartbeats"

class HeartbeatStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props)

        const notificationSnsTopic = new Topic(this, "HeartbeatNotifications", {
            displayName: "Heartbeat Email Notifications Topic",
        })
        notificationSnsTopic.addSubscription(new EmailSubscription(config.HEARTBEAT_NOTIFICATION_EMAIL))

        const heartbeatFunction = new lambda.Function(this, "HeartbeatLambda", {
            runtime: lambda.Runtime.NODEJS_20_X,
            code: lambda.Code.fromAsset("resources"),
            handler: "handler.main",
            environment: {
                HEARTBEAT_OFFLINE_TABLE_NAME,
                HEARTBEAT_URLS: config.HEARTBEAT_URLS.join("$"),
                HEARTBEAT_NOTIFICATION_SNS_TOPIC_ARN: notificationSnsTopic.topicArn,
            },
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.seconds(config.HEARTBEAT_RUN_TIMEOUT_SECONDS),
        })

        const eventRule = new events.Rule(this, "HeartbeatSQSTrigger", {
            schedule: events.Schedule.rate(Duration.minutes(config.HEARTBEAT_RUN_INTERVAL_MINUTES)),
        })
        eventRule.addTarget(new targets.LambdaFunction(heartbeatFunction))

        const heartbeatOfflineTable = new dynamodb.Table(this, HEARTBEAT_OFFLINE_TABLE_NAME, {
            tableName: HEARTBEAT_OFFLINE_TABLE_NAME,
            partitionKey: { name: "url", type: dynamodb.AttributeType.STRING },
            removalPolicy: RemovalPolicy.DESTROY,
        })
        heartbeatOfflineTable.grantReadWriteData(heartbeatFunction)

        notificationSnsTopic.grantPublish(heartbeatFunction)
    }
}

module.exports = { HeartbeatStack, ACCOUNT_SETTINGS }

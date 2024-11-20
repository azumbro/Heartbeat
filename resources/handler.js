const { DynamoDBClient, DeleteItemCommand, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb")
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns")
const https = require("https")

const DYNAMO = new DynamoDBClient({ region: "us-west-2" })
const SNS = new SNSClient({ region: "us-west-2" })

const DELIMITER = "$"
const HEARTBEAT_OFFLINE_TABLE_NAME = process.env.HEARTBEAT_OFFLINE_TABLE_NAME
const HEARTBEAT_URLS = process.env.HEARTBEAT_URLS.split(DELIMITER)
const OFFLINE_STATUS_CODE = 400

exports.main = async function () {
    console.log("Heartbeat function invoked")

    for (url of HEARTBEAT_URLS) {
        console.log(`Checking status for ${url}`)
        const statusCode = await getStatusCode(url)
        console.log(`Check returned status code ${statusCode}`)

        const offlineTableEntry = await getItem(url)
        if (statusCode < OFFLINE_STATUS_CODE && offlineTableEntry) {
            console.log("Status code detected as now online")
            await sendAlertMessage(url, "URL is now online")
            await deleteItem(url)
        } else if (statusCode >= OFFLINE_STATUS_CODE && !offlineTableEntry) {
            console.log("Status code detected as now online")
            await sendAlertMessage(url, `URL is now offline (status code ${statusCode})`)
            await putItem(url)
        } else {
            console.log("No Status code change detected")
        }
    }
}

async function getStatusCode(url) {
    try {
        return await new Promise((resolve, reject) => {
            const req = https.get(url, (res) => {
                resolve(res.statusCode)
            })

            req.on("error", (err) => {
                reject(err)
            })
        })
    } catch (e) {
        return 0
    }
}

async function getItem(url) {
    const params = {
        TableName: HEARTBEAT_OFFLINE_TABLE_NAME,
        Key: { url: { S: url } },
    }

    console.log(`Getting item with key "${url}" from ${HEARTBEAT_OFFLINE_TABLE_NAME}`)
    const command = new GetItemCommand(params)
    const result = await DYNAMO.send(command)
    return result && result.Item
}

async function deleteItem(url) {
    const params = {
        TableName: HEARTBEAT_OFFLINE_TABLE_NAME,
        Key: { url: { S: url } },
    }

    console.log(`Deleting item with key "${url}" from ${HEARTBEAT_OFFLINE_TABLE_NAME}`)
    const command = new DeleteItemCommand(params)
    await DYNAMO.send(command)
}

async function putItem(url) {
    const params = {
        TableName: HEARTBEAT_OFFLINE_TABLE_NAME,
        Item: {
            url: { S: url },
            timestamp: { N: Date.now().toString() },
        },
    }

    console.log(`Putting item with key "${url}" to ${HEARTBEAT_OFFLINE_TABLE_NAME}`)
    const command = new PutItemCommand(params)
    await DYNAMO.send(command)
}

async function sendAlertMessage(url, message) {
    console.log("Sending alert message")

    const params = {
        TopicArn: process.env.HEARTBEAT_NOTIFICATION_SNS_TOPIC_ARN,
        Message: `
            ===== Heartbeat Alert =====\n
            URL: ${url}\n
            ${message}
        `,
    }

    const command = new PublishCommand(params)
    await SNS.send(command)
}

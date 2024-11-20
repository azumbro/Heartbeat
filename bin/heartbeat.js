#!/usr/bin/env node

const cdk = require("aws-cdk-lib")
const { ACCOUNT_SETTINGS, HeartbeatStack } = require("../lib/heartbeat-stack")

const app = new cdk.App()
new HeartbeatStack(app, "HeartbeatStack", { env: ACCOUNT_SETTINGS })

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "PlayDevopsAgentsStack", {
	env: {
		region: "us-east-1",
	},
});

const table = new dynamodb.TableV2(stack, "Table", {
	partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
	sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
	removalPolicy: cdk.RemovalPolicy.DESTROY,
});

const fn = new nodejs.NodejsFunction(stack, "Function", {
	environment: {
		TABLE_NAME: table.tableName,
	},
});
// table.grantReadWriteData(fn);

const rule = new events.Rule(stack, "Rule", {
	schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
});
rule.addTarget(new targets.LambdaFunction(fn));

fn.metricErrors().createAlarm(stack, "FunctionErrorAlarm", {
	threshold: 1,
	evaluationPeriods: 1,
});

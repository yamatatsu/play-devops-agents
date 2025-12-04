import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "PlayDevopsAgentsStack");

const table = new dynamodb.TableV2(stack, "Table", {
	partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
	sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
	billing: dynamodb.Billing.provisioned({
		readCapacity: dynamodb.Capacity.fixed(1),
		writeCapacity: dynamodb.Capacity.autoscaled({
			minCapacity: 1,
			maxCapacity: 2,
		}),
	}),
	removalPolicy: cdk.RemovalPolicy.DESTROY,
});

const fn = new nodejs.NodejsFunction(stack, "Function", {
	environment: {
		TABLE_NAME: table.tableName,
	},
});
table.grantReadWriteData(fn);

const rule = new events.Rule(stack, "Rule", {
	schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
});

rule.addTarget(new targets.LambdaFunction(fn));

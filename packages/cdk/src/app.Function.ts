import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const doc = DynamoDBDocument.from(client);

const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async () => {
	await doc.put({
		TableName: TABLE_NAME,
		Item: {
			pk: "1",
			sk: new Date().toISOString(),
			val: Math.random() * 100,
		},
	});
};

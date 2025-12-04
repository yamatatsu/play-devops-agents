import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

const IAM_REPO_DEPLOY_ACCESS = "repo:yamatatsu/play-devops-agents:*";

export class DeployRoleStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: cdk.StackProps) {
		super(scope, id, props);

		const githubProvider = new iam.OpenIdConnectProvider(
			this,
			"GithubActionsProvider",
			{
				url: "https://token.actions.githubusercontent.com",
				clientIds: ["sts.amazonaws.com"],
			},
		);

		const role = new iam.Role(this, "gitHubDeployRole", {
			roleName: "play-devops-agents-deploy-role",
			assumedBy: new iam.WebIdentityPrincipal(
				githubProvider.openIdConnectProviderArn,
				{
					StringLike: {
						"token.actions.githubusercontent.com:sub": IAM_REPO_DEPLOY_ACCESS,
						"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
					},
				},
			),
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
			],
			maxSessionDuration: cdk.Duration.hours(1),
		});

		new cdk.CfnOutput(this, "GithubActionOidcIamRoleArn", {
			value: role.roleArn,
			exportName: "GithubActionOidcIamRoleArn",
		});
	}
}

# AWS CDK Deployment Failure Root Cause Analysis RunBook

## Overview

This RunBook defines the procedures for identifying the root cause of incidents caused by AWS CDK deployments via GitHub Actions.

**Objective**: Compare code differences between the failed deployment and the last successful deployment, identify the change that caused the issue, and propose a fix.

**Target Repository Configuration**:
- Monorepo structure
- Deployment workflow: `.github/workflows/deploy.yaml`
- Deployment trigger: Merge to `main` branch

---

## Prerequisites

### Scope of This RunBook

This RunBook targets **issues that cannot be resolved by re-running the GitHub Actions Job**.

| In Scope | Out of Scope |
|----------|--------------|
| Deployment failures caused by code changes | Temporary network issues |
| CDK / CloudFormation configuration errors | Temporary AWS service outages |
| Application code bugs | Temporary GitHub Actions runner issues |
| Breaking changes in dependencies | Temporary failures due to rate limits |
| IAM permission configuration errors | Timeouts (if retry succeeds) |

**Important**: If the investigation reveals that the root cause is a code change, **you must fix the code rather than re-running the Job**. Re-running is only a temporary workaround and does not resolve the root cause. The same issue will likely recur.

### MCP Server Used by AI Agent
- **GitHub MCP Server** (`github/github-mcp-server`)

### Required Input Information
Confirm the following information before starting the investigation:

| Item | Description | Example |
|------|-------------|---------|
| `owner` | Repository owner (Organization or User) | `my-org` |
| `repo` | Repository name | `my-monorepo` |
| `failed_commit_sha` | Commit SHA of the failed deployment (if known) | `abc1234...` |
| `incident_timestamp` | Incident occurrence time (if known) | `2025-06-15T10:30:00Z` |

---

## Investigation Steps

### Step 1: Verify Repository Information

First, verify the basic information of the target repository.

```
[Tool to Execute]
search_repositories

[Parameters]
{
  "query": "{owner}/{repo}"
}
```

**Verification Points**:
- Repository exists and is accessible
- Default branch is `main`

---

### Step 2: Get Recent Commit History of main Branch

To identify the commits for the failed deployment and the last successful deployment, retrieve the commit history of the `main` branch.

```
[Tool to Execute]
list_commits

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "main",
  "perPage": 20
}
```

**Information to Extract from Output**:
- `sha` (commit hash) of each commit
- `message` (commit message) of each commit
- `date` (timestamp) of each commit

**Information to Use in Next Steps**:
- **Failed deployment commit SHA** (`failed_sha`): The commit closest to the incident occurrence time
- **Last successful deployment commit SHA** (`success_sha`): The commit immediately before the failed commit

> 💡 **Tip**: If the commit message contains "Merge pull request #XXX", it indicates a deployment triggered by a PR merge. Note the PR number for later investigation.

---

### Step 3: Get Details of the Failed Deployment Commit

Retrieve the details of the commit corresponding to the failed deployment.

```
[Tool to Execute]
get_commit

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "{failed_sha}"
}
```

**Information to Record from Output**:
- List of changed files in the commit
- Change type for each file (added / modified / removed)
- Commit author

---

### Step 4: Get Details of the Last Successful Deployment Commit

Retrieve the details of the commit from the last successful deployment for comparison.

```
[Tool to Execute]
get_commit

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "{success_sha}"
}
```

---

### Step 5: Identify Files Changed Between the Two Commits

Compare the commit information obtained in Steps 3 and 4, and list the files newly changed in the failed deployment.

**Analysis Perspective**:

| Category | Example Paths | Priority |
|----------|---------------|----------|
| CDK Infrastructure Code | `infra/`, `cdk/`, `lib/` | 🔴 High |
| Application Code | `src/`, `app/`, `packages/` | 🔴 High |
| Dependencies | `package.json`, `package-lock.json`, `requirements.txt` | 🟡 Medium |
| CI/CD Configuration | `.github/workflows/`, `buildspec.yml` | 🟡 Medium |
| Configuration Files | `*.config.js`, `*.json`, `.env*` | 🟡 Medium |
| Documentation | `*.md`, `docs/` | 🟢 Low |

---

### Step 6: Retrieve and Analyze Changed File Contents

Retrieve the current contents of the identified changed files. Check files in order of priority.

```
[Tool to Execute]
get_file_contents

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "path": "{file_path}",
  "branch": "main"
}
```

**Key Points to Check for CDK Code**:
- Newly added Stacks or Constructs
- Changes to resource configuration values (memory, timeout, environment variables, etc.)
- IAM policy changes
- VPC / Security Group configuration changes
- Dependency changes (references to other Stacks, etc.)

---

### Step 7: Check Details of Related Pull Request

If the failed deployment was triggered by a PR merge, check the PR details.

#### 7-1: Get PR Details

```
[Tool to Execute]
get_pull_request

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "pullNumber": {pr_number}
}
```

#### 7-2: Get List of Files Changed in PR

```
[Tool to Execute]
get_pull_request_files

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "pullNumber": {pr_number}
}
```

#### 7-3: Get PR Diff

```
[Tool to Execute]
get_pull_request_diff

[Parameters]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "pullNumber": {pr_number}
}
```

**Points to Check in the Diff**:
- Whether important code was deleted (lines starting with `-`)
- Whether added lines (lines starting with `+`) could cause errors
- Configuration value changes (numbers, strings, booleans, etc.)

---

### Step 8: Cross-Reference with AWS Error Information

Cross-reference the changes identified on the GitHub side with error information from AWS.

#### AWS Resources to Check

| AWS Service | What to Check |
|-------------|---------------|
| **CloudFormation** | Stack events, failure reasons, rollback reasons |
| **CloudWatch Logs** | Lambda execution logs, ECS task logs, API Gateway logs |
| **CloudTrail** | API call history, error responses |
| **EventBridge** | Event rule execution history |
| **IAM** | Policy evaluation, access denial details |

#### Common Error Patterns and Checkpoints

| Error Pattern | Changes to Check |
|---------------|------------------|
| `Resource already exists` | Addition of resource definitions that duplicate existing resources |
| `Access Denied` / `Not Authorized` | IAM policy, role changes |
| `Timeout` | Lambda timeout settings, VPC configuration |
| `Memory` errors | Lambda memory settings, container resource settings |
| `Circular dependency` | Changes to inter-Stack reference relationships |
| `Invalid parameter` | Changes to resource property values |
| `Rate exceeded` | Mass resource creation, parallel execution settings |

---

### Step 9: Identify Related Code Through Code Search

Search for code using keywords or resource names from error messages to identify related sections.

```
[Tool to Execute]
search_code

[Parameters]
{
  "q": "{search_keyword} repo:{owner}/{repo}"
}
```

**Example Search Keywords**:
- Resource Logical ID
- CloudFormation resource type name
- Unique strings from error messages
- Environment variable names
- IAM policy action names

---

### Step 10: Identify Root Cause and Propose Fix

Synthesize the collected information to identify the root cause and summarize the fix proposal.

#### Root Cause Report Template

```markdown
## Incident Root Cause Analysis Results

### Summary
- **Incident Occurrence Time**: YYYY-MM-DD HH:MM:SS (UTC)
- **Failed Commit**: {failed_sha}
- **Last Successful Commit**: {success_sha}
- **Related PR**: #{pr_number}

### Changes That Caused the Issue
| File | Change Details | Impact |
|------|----------------|--------|
| path/to/file.ts | Specific change description | What problem it caused |

### Root Cause
{Detailed explanation of the cause}

### Proposed Fix
{Specific fix details}

### Files to Modify
- `path/to/file1.ts`: Summary of changes
- `path/to/file2.ts`: Summary of changes

### Prevention Measures
- {Suggestions to prevent similar issues in the future}
```

---

## Appendix: Common Cause Patterns and Solutions

### Pattern 1: CDK Breaking Changes

**Symptoms**: `Resource replacement required` or `UPDATE_ROLLBACK_COMPLETE`

**Checkpoints**:
- Whether the resource's Logical ID was changed
- Whether `removalPolicy` settings were changed
- Whether physical names (`*Name` properties) were changed

**Solutions**:
- Implement a mechanism to check `cdk diff` results beforehand
- Consider staged migration for breaking changes

---

### Pattern 2: Dependency Issues

**Symptoms**: `Circular dependency` or `Export not found`

**Checkpoints**:
- Whether there are circular dependencies between Stacks
- Whether Export/Import consistency is maintained
- Whether `addDependency()` is configured correctly

**Solutions**:
- Consider splitting or consolidating Stacks
- Implement indirect references using SSM Parameter Store

---

### Pattern 3: Insufficient IAM Permissions

**Symptoms**: `Access Denied` or `is not authorized to perform`

**Checkpoints**:
- Permissions of the IAM role used for deployment
- Whether necessary permissions for new resources are granted
- Resource-based policy settings (S3 bucket policies, etc.)

**Solutions**:
- Add minimum required permissions
- Verify with IAM Access Analyzer

---

### Pattern 4: Lambda Configuration Errors

**Symptoms**: `Task timed out` or `Runtime.ImportModuleError`

**Checkpoints**:
- Timeout value settings
- Memory size settings
- Handler name settings
- VPC configuration (presence of NAT Gateway)

**Solutions**:
- Change to appropriate resource settings
- Verify endpoints for VPC Lambda

---

## Troubleshooting

### When Errors Occur with GitHub MCP Server Tools

| Error | Cause | Solution |
|-------|-------|----------|
| `404 Not Found` | Repository or resource does not exist | Verify owner/repo values |
| `403 Forbidden` | No access permissions | Verify GitHub Token permissions |
| `422 Unprocessable Entity` | Invalid parameters | Verify parameter format |

### When Commit History Is Too Large to Identify

Use the `since` parameter of `list_commits` to narrow down to the period around the incident occurrence.

```
[Parameter Example]
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "main",
  "perPage": 50,
  "since": "2025-06-14T00:00:00Z"
}
```

---

## Reference: GitHub MCP Server Key Tools

| Tool Name | Purpose |
|-----------|---------|
| `list_commits` | Get commit history |
| `get_commit` | Get commit details (including changed files) |
| `get_file_contents` | Get file contents |
| `get_pull_request` | Get PR details |
| `get_pull_request_files` | Get list of files changed in PR |
| `get_pull_request_diff` | Get PR diff |
| `search_code` | Code search |
| `list_branches` | List branches |

---

*This RunBook is designed for automated execution by an AI Agent. Execute the tool calls in each step sequentially, synthesize the collected information, and identify the root cause and propose a fix.*
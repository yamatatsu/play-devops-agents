# AWS CDK デプロイ障害 原因調査 RunBook

## 概要

このRunBookは、GitHub Actions による AWS CDK デプロイが起因で発生したインシデントの原因を特定するための手順を定義します。

**目的**: 失敗したデプロイと前回成功したデプロイのコード差分を比較し、原因となった変更を特定して修正提案を行う

**対象リポジトリ構成**:
- モノレポ構成
- デプロイワークフロー: `.github/workflows/deploy.yaml`
- デプロイトリガー: `main` ブランチへのマージ

---

## 前提条件

### このRunBookの適用範囲

このRunBookは、**GitHub Actions Job の再実行（Re-run）では解決できない問題**を対象としています。

| 対象となるケース | 対象外のケース |
|-----------------|---------------|
| コードの変更に起因するデプロイ失敗 | 一時的なネットワーク障害 |
| CDK / CloudFormation の設定ミス | AWS サービスの一時的な障害 |
| アプリケーションコードのバグ | GitHub Actions ランナーの一時的な問題 |
| 依存関係の破壊的変更 | Rate Limit による一時的な失敗 |
| IAM 権限設定の誤り | タイムアウト（リトライで成功する場合） |

**重要**: 調査の結果、原因がコード変更にあると判明した場合は、**Job の Re-run ではなく、必ずコード修正による対応**を行ってください。Re-run は一時的な回避策に過ぎず、根本原因を解決しません。同じ問題が再発するリスクがあります。

### AI Agent が利用する MCP Server
- **GitHub MCP Server** (`github/github-mcp-server`)

### 必要な入力情報
調査開始前に、以下の情報を確認してください：

| 項目 | 説明 | 例 |
|------|------|-----|
| `owner` | リポジトリオーナー（Organization または User） | `my-org` |
| `repo` | リポジトリ名 | `my-monorepo` |
| `failed_commit_sha` | 失敗したデプロイのコミットSHA（わかる場合） | `abc1234...` |
| `incident_timestamp` | インシデント発生日時（わかる場合） | `2025-06-15T10:30:00Z` |

---

## 調査手順

### Step 1: リポジトリ情報の確認

まず、対象リポジトリの基本情報を確認します。

```
【実行するツール】
search_repositories

【パラメータ】
{
  "query": "{owner}/{repo}"
}
```

**確認ポイント**:
- リポジトリが存在し、アクセス可能であること
- デフォルトブランチが `main` であること

---

### Step 2: main ブランチの最近のコミット履歴を取得

失敗したデプロイと前回成功したデプロイのコミットを特定するため、`main` ブランチのコミット履歴を取得します。

```
【実行するツール】
list_commits

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "main",
  "perPage": 20
}
```

**出力から確認すべき情報**:
- 各コミットの `sha`（コミットハッシュ）
- 各コミットの `message`（コミットメッセージ）
- 各コミットの `date`（日時）

**次のステップで使用する情報**:
- **失敗したデプロイのコミット SHA** (`failed_sha`): インシデント発生時刻に最も近いコミット
- **前回成功したデプロイのコミット SHA** (`success_sha`): 失敗コミットの1つ前のコミット

> 💡 **Tip**: コミットメッセージに "Merge pull request #XXX" が含まれている場合、それはPRマージによるデプロイトリガーです。PR番号を記録しておくと、後の調査で役立ちます。

---

### Step 3: 失敗したデプロイのコミット詳細を取得

失敗したデプロイに対応するコミットの詳細を取得します。

```
【実行するツール】
get_commit

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "{failed_sha}"
}
```

**出力から記録すべき情報**:
- コミットに含まれる変更ファイル一覧
- 各ファイルの変更種別（added / modified / removed）
- コミットの作成者

---

### Step 4: 前回成功したデプロイのコミット詳細を取得

比較対象となる前回成功時のコミット詳細を取得します。

```
【実行するツール】
get_commit

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "{success_sha}"
}
```

---

### Step 5: 2つのコミット間で変更されたファイルを特定

Step 3 と Step 4 で取得したコミット情報を比較し、失敗したデプロイで新たに変更されたファイルをリストアップします。

**分析の観点**:

| カテゴリ | 対象パス（例） | 優先度 |
|----------|---------------|--------|
| CDK インフラコード | `infra/`, `cdk/`, `lib/` | 🔴 高 |
| アプリケーションコード | `src/`, `app/`, `packages/` | 🔴 高 |
| 依存関係 | `package.json`, `package-lock.json`, `requirements.txt` | 🟡 中 |
| CI/CD 設定 | `.github/workflows/`, `buildspec.yml` | 🟡 中 |
| 設定ファイル | `*.config.js`, `*.json`, `.env*` | 🟡 中 |
| ドキュメント | `*.md`, `docs/` | 🟢 低 |

---

### Step 6: 変更されたファイルの内容を取得・分析

特定した変更ファイルの現在の内容を取得します。優先度の高いファイルから順に確認してください。

```
【実行するツール】
get_file_contents

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "path": "{file_path}",
  "branch": "main"
}
```

**CDK コードの場合、特に確認すべきポイント**:
- 新しく追加された Stack や Construct
- リソースの設定値変更（メモリ、タイムアウト、環境変数など）
- IAM ポリシーの変更
- VPC / セキュリティグループの設定変更
- 依存関係の変更（他の Stack への参照など）

---

### Step 7: 関連する Pull Request の詳細を確認

失敗したデプロイがPRマージによるものであった場合、PRの詳細を確認します。

#### 7-1: PR の詳細を取得

```
【実行するツール】
get_pull_request

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "pullNumber": {pr_number}
}
```

#### 7-2: PR の変更ファイル一覧を取得

```
【実行するツール】
get_pull_request_files

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "pullNumber": {pr_number}
}
```

#### 7-3: PR の差分（diff）を取得

```
【実行するツール】
get_pull_request_diff

【パラメータ】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "pullNumber": {pr_number}
}
```

**差分から確認すべきポイント**:
- 削除された行（`-` で始まる行）に重要なコードがないか
- 追加された行（`+` で始まる行）にエラーの原因となりそうなコードがないか
- 設定値の変更（数値、文字列、boolean など）

---

### Step 8: AWS 側のエラー情報と突き合わせ

GitHub 側で特定した変更内容を、AWS 側のエラー情報と突き合わせます。

#### 確認すべき AWS リソース

| AWS サービス | 確認内容 |
|-------------|---------|
| **CloudFormation** | スタックイベント、失敗理由、ロールバック理由 |
| **CloudWatch Logs** | Lambda 実行ログ、ECS タスクログ、API Gateway ログ |
| **CloudTrail** | API コール履歴、エラーレスポンス |
| **EventBridge** | イベントルールの実行履歴 |
| **IAM** | ポリシーの評価、アクセス拒否の詳細 |

#### 典型的なエラーパターンと確認ポイント

| エラーパターン | 確認すべき変更 |
|---------------|---------------|
| `Resource already exists` | 既存リソースと重複するリソース定義の追加 |
| `Access Denied` / `Not Authorized` | IAM ポリシー、ロールの変更 |
| `Timeout` | Lambda タイムアウト設定、VPC 設定 |
| `Memory` エラー | Lambda メモリ設定、コンテナリソース設定 |
| `Circular dependency` | Stack 間の参照関係の変更 |
| `Invalid parameter` | リソースプロパティの値変更 |
| `Rate exceeded` | 大量のリソース作成、並列実行設定 |

---

### Step 9: コード検索による関連箇所の特定

エラーメッセージに含まれるキーワードやリソース名でコードを検索し、関連箇所を特定します。

```
【実行するツール】
search_code

【パラメータ】
{
  "q": "{検索キーワード} repo:{owner}/{repo}"
}
```

**検索キーワードの例**:
- リソースの Logical ID
- CloudFormation のリソースタイプ名
- エラーメッセージに含まれる固有の文字列
- 環境変数名
- IAM ポリシーのアクション名

---

### Step 10: 原因の特定と修正提案

収集した情報を総合し、原因を特定して修正提案をまとめます。

#### 原因特定レポートのテンプレート

```markdown
## インシデント原因調査結果

### サマリ
- **インシデント発生日時**: YYYY-MM-DD HH:MM:SS (JST)
- **失敗したコミット**: {failed_sha}
- **前回成功したコミット**: {success_sha}
- **関連PR**: #{pr_number}

### 原因となった変更
| ファイル | 変更内容 | 影響 |
|---------|---------|------|
| path/to/file.ts | 具体的な変更内容 | どのような問題を引き起こしたか |

### 根本原因
{原因の詳細な説明}

### 修正提案
{具体的な修正内容}

### 修正対象ファイル
- `path/to/file1.ts`: 修正内容の概要
- `path/to/file2.ts`: 修正内容の概要

### 再発防止策
- {将来同様の問題を防ぐための提案}
```

---

## 補足: よくある原因パターンと対処法

### パターン 1: CDK の破壊的変更

**症状**: `Resource replacement required` や `UPDATE_ROLLBACK_COMPLETE`

**確認ポイント**:
- リソースの Logical ID が変更されていないか
- `removalPolicy` の設定が変更されていないか
- 物理名（`*Name` プロパティ）が変更されていないか

**対処法**:
- `cdk diff` の結果を事前に確認する仕組みの導入
- 破壊的変更を伴う場合は段階的な移行を検討

---

### パターン 2: 依存関係の問題

**症状**: `Circular dependency` や `Export not found`

**確認ポイント**:
- Stack 間の依存関係に循環がないか
- Export/Import の整合性が取れているか
- `addDependency()` の設定が適切か

**対処法**:
- Stack の分割・統合を検討
- SSM Parameter Store を使った間接参照の導入

---

### パターン 3: IAM 権限不足

**症状**: `Access Denied` や `is not authorized to perform`

**確認ポイント**:
- デプロイに使用する IAM ロールの権限
- 新しいリソースに必要な権限が付与されているか
- Resource ベースのポリシー（S3 バケットポリシーなど）の設定

**対処法**:
- 必要最小限の権限を追加
- IAM Access Analyzer での検証

---

### パターン 4: Lambda の設定ミス

**症状**: `Task timed out` や `Runtime.ImportModuleError`

**確認ポイント**:
- タイムアウト値の設定
- メモリサイズの設定
- ハンドラー名の設定
- VPC 設定（NAT Gateway の有無）

**対処法**:
- 適切なリソース設定への変更
- VPC Lambda の場合はエンドポイントの確認

---

## トラブルシューティング

### GitHub MCP Server のツールでエラーが発生した場合

| エラー | 原因 | 対処法 |
|--------|------|--------|
| `404 Not Found` | リポジトリまたはリソースが存在しない | owner/repo の値を確認 |
| `403 Forbidden` | アクセス権限がない | GitHub Token の権限を確認 |
| `422 Unprocessable Entity` | パラメータが不正 | パラメータ形式を確認 |

### コミット履歴が多すぎて特定が困難な場合

`list_commits` の `since` パラメータを使用して、インシデント発生前後の期間に絞り込みます。

```
【パラメータ例】
{
  "owner": "{owner}",
  "repo": "{repo}",
  "sha": "main",
  "perPage": 50,
  "since": "2025-06-14T00:00:00Z"
}
```

---

## 付録: GitHub MCP Server 主要ツールリファレンス

| ツール名 | 用途 |
|---------|------|
| `list_commits` | コミット履歴の取得 |
| `get_commit` | コミット詳細の取得（変更ファイル含む） |
| `get_file_contents` | ファイル内容の取得 |
| `get_pull_request` | PR の詳細取得 |
| `get_pull_request_files` | PR で変更されたファイル一覧 |
| `get_pull_request_diff` | PR の差分取得 |
| `search_code` | コード検索 |
| `list_branches` | ブランチ一覧 |

---

*このRunBookは AI Agent による自動実行を想定しています。各ステップのツール呼び出しを順次実行し、収集した情報を統合して原因特定と修正提案を行ってください。*
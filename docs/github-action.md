# Preview plugin readmes on pull requests

Copy [plugin-repository-workflow.yml](plugin-repository-workflow.yml) to `.github/workflows/readme-preview.yml` in a **public** plugin repository and merge it into the default branch. New or updated pull requests affecting the readme, PHP files, or listing assets will receive a comment.

The comment contains a link to [readme.joost.blog](https://readme.joost.blog/), visible preflight warnings, and expandable passing checks and notes. Later runs update the same bot comment. Warnings do not fail the job; import or parsing failures do. A failed WordPress version lookup appears as an unchecked note.

## Configuration

The example uses `jdevalk/plugin-page-preview@v1`. For an immutable action dependency, replace `v1` with a full commit SHA from this repository. This action version is separate from the plugin commit: preview links always contain the pull request's exact head SHA.

For a plugin in a subdirectory, add:

```yaml
        with:
          plugin-path: plugins/my-plugin
```

The directory must contain `readme.txt` or `README.md`; case-insensitive `readme.txt` takes precedence. The action also reads root PHP headers and supported artwork in `.wordpress-org/`, `assets/`, or sibling SVN assets directories.

The workflow uses the built-in `github.token` with `contents: read` and `pull-requests: write`. No personal token, Cloudflare credentials, website deployment, or npm install is needed. Repository or organization policy must allow Actions to write pull-request comments.

Use the example's `ubuntu-24.04` runner. The action uses Node 24 and requires PHP 8.1+ with mbstring and sodium available on PATH; self-hosted runners must provide these. `PHP_BINARY` can select another PHP executable.

Outputs are `preview-url`, `warnings` (count), and `comment-url`.

## Forks and permissions

The workflow uses `pull_request_target` so it can comment on fork pull requests. It deliberately has no checkout step: the trusted action downloads selected public files and treats plugin PHP as text. Only the action's bundled WordPress.org parser executes. Keep this job limited to the trusted action; do not add steps that execute code from the pull request with its write token.

The action ignores closed pull requests and obsolete head revisions. Separate plugin paths get separate comments. It recognizes comments from `github-actions[bot]`; custom bot tokens are not supported for updating existing comments.

## Browser preview limits

Visitors load public files directly from GitHub without authentication. GitHub request limits, deleted repositories or commits, and oversized files can prevent imports. The page explains the failure and still allows local folder import. Private repositories are rejected. Preview links are not snapshots stored by this service.

Preflight checks readme content, metadata, and listing assets. They do not execute plugin code or establish runtime compatibility with WordPress. Passing checks are not an approval guarantee from WordPress.org.

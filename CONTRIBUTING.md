# Contributing to WordPress Publisher

Thank you for improving this plugin. Contributions of code, documentation, translations, testing, and bug reports are all welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## 中文摘要

欢迎参与贡献。请先阅读行为准则；提交 Issue 时不要包含应用程序密码、`data.json` 或请求头等敏感信息。开发前请运行 `npm ci`、`npm run check`，新增用户文案必须同时提供中文和英文，发布行为的改动需要补充测试。提交 PR 前请保持改动聚焦，并在描述中说明测试方式。

---

## Ways to contribute

- Report reproducible bugs.
- Propose features with a clear use case.
- Improve the Chinese or English documentation.
- Add or refine translations.
- Add tests for publishing, media, and link conversion.
- Review pull requests.

## Before opening an issue

1. Search existing issues.
2. Confirm the problem is reproducible on the latest release.
3. Test the WordPress connection from the settings page.
4. Collect the relevant version numbers: Obsidian, WordPress, plugin, PHP, and theme/security plugins when relevant.

**Never include:**

- WordPress application passwords
- `data.json` contents
- `Authorization` headers
- Private site URLs if they must remain private

Redact logs before pasting them.

## Development setup

```bash
git clone https://github.com/spark-ai-boy/obsidian-wordpress-publisher.git
cd obsidian-wordpress-publisher
npm ci
npm run check
```

For iterative development:

```bash
npm run dev
```

Link the repository into a test vault:

```bash
ln -s "$PWD" "/path/to/vault/.obsidian/plugins/wordpress-publisher"
```

Reload the plugin in Obsidian after changes.

## Pull request process

1. Fork the repository and create a focused branch.
2. Make the smallest reasonable change.
3. Add or update tests for behavior changes.
4. Run `npm run check`.
5. Update documentation and `CHANGELOG.md` when user-facing behavior changes.
6. Open a pull request describing the problem, the solution, and how it was tested.

Please avoid unrelated refactors in a bug-fix pull request.

### Commit messages

Conventional Commits are recommended:

```text
feat: add scheduled post support
fix: preserve remote tags on quick publish
docs: clarify application password setup
test: cover remote image uploads
chore: bump dependencies
```

## Coding guidelines

- TypeScript strict mode is required.
- Keep runtime dependencies at zero. Everything must bundle into `main.js`.
- Route HTTP through Obsidian `requestUrl` so mobile and CORS behavior stays correct.
- Never write credentials to logs, errors, URLs, or analytics.
- All user-visible strings must be added to both `src/i18n/en.ts` and `src/i18n/zh.ts`.
- Prefer small, testable functions in `src/utils` and `src/wordpress`.
- Preserve backward compatibility with existing frontmatter keys.
- Do not silently drop note content. If an image cannot be uploaded, surface a warning or stop the publish.
- Keep UI usable with both light and dark themes by using Obsidian CSS variables.

## Testing checklist

Before opening a pull request:

- [ ] `npm run check` passes.
- [ ] New behavior has a unit test where practical.
- [ ] Both English and Chinese strings are present.
- [ ] Publishing a new post still works.
- [ ] Updating an existing post still works.
- [ ] Local image upload and cache reuse still work.
- [ ] No credentials appear in logs or test fixtures.
- [ ] The UI is checked in light and dark modes.

### Manual test ideas

- Create/update a draft, published post, pending post, private post, and scheduled post.
- Publish with no categories, multiple categories, existing tags, and new tags.
- Publish with a local featured image, a remote featured image, and no featured image.
- Publish a note with code, tables, task lists, footnotes, wiki links, and missing images.
- Edit the post remotely, then publish again and verify the conflict prompt.
- Switch between two site profiles and verify the link warning.
- Test on mobile when changing UI code.

## Translations

The UI has two complete dictionaries:

- `src/i18n/en.ts`
- `src/i18n/zh.ts`

`zh.ts` is typed as `Record<TranslationKey, string>`, so TypeScript reports missing keys. When adding a string:

1. Add the key to `en.ts`.
2. Add the same key to `zh.ts`.
3. Use `t("key")` instead of a literal string in UI code.
4. Interpolate values with `{{name}}`.
5. Verify long strings at mobile width.

## Security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

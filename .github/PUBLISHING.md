# Publishing to npm

This repository is configured to automatically publish to npm when releases are created.

## Setup

### 1. NPM Token

You need to add an NPM automation token as a GitHub secret:

1. Log in to [npmjs.com](https://www.npmjs.com/)
2. Go to your account settings → Access Tokens
3. Generate a new token:
   - Type: `Automation`
   - Description: `pg-typesafe-triggers GitHub Actions`
4. Copy the token
5. Go to your GitHub repository → Settings → Secrets and variables → Actions
6. Add a new secret:
   - Name: `NPM_TOKEN`
   - Value: The token you copied

## Publishing Methods

### Method 1: npm version (Recommended)

```bash
# Bump version, create commit and tag
npm version patch  # or minor, major, or specific version like 0.3.1

# Push commit and tag
git push origin main --tags
```

The GitHub Actions workflow will automatically:
- Run tests
- Build the package  
- Publish to npm

### Method 2: GitHub Release

1. Create a GitHub release:
   - Go to Releases → Create a new release
   - Create a new tag (e.g., `v0.3.1`)
   - Write release notes
   - Publish release

### Method 3: Manual Workflow Dispatch

1. Go to Actions → Release workflow
2. Click "Run workflow"
3. Enter the version number (e.g., `0.3.1`)
4. Click "Run workflow"

This will:
- Update package.json version
- Run tests
- Build and publish to npm
- Create a GitHub release

## Version Guidelines

- Follow [Semantic Versioning](https://semver.org/)
- Patch releases (0.3.x): Bug fixes
- Minor releases (0.x.0): New features (backwards compatible)
- Major releases (x.0.0): Breaking changes

## Pre-publish Checklist

- [ ] All tests pass locally
- [ ] Version number updated in package.json
- [ ] CHANGELOG.md updated with release notes
- [ ] README.md updated if needed
- [ ] No uncommitted changes

## Troubleshooting

### "Version already exists" error

This means the version in package.json was already published. Update to a new version number.

### Authentication failed

Check that the NPM_TOKEN secret is correctly set in GitHub settings.

### Tests failing

The publish workflow runs tests first. Fix any failing tests before publishing.
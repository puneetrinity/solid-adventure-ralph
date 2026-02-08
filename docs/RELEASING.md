# Release Process

This document describes how to create a new release of arch-orchestrator.

## Prerequisites

- All tests passing (`npm test`)
- No uncommitted changes
- On the `main` branch

## Steps

### 1. Update Version

Use npm version to bump the version. This will:
- Update package.json version
- Run changelog generation
- Create a git commit
- Create a git tag

```bash
# For patch releases (bug fixes)
npm run release patch

# For minor releases (new features)
npm run release minor

# For major releases (breaking changes)
npm run release major
```

### 2. Push to GitHub

```bash
git push origin main --tags
```

### 3. GitHub Actions

The release workflow (`.github/workflows/release.yml`) will automatically:
- Run tests
- Extract release notes from CHANGELOG.md
- Create a GitHub Release with the notes

## Manual Release

If you need to create a release manually:

1. Update CHANGELOG.md with the new version section
2. Commit changes: `git commit -am "chore: release vX.Y.Z"`
3. Create tag: `git tag vX.Y.Z`
4. Push: `git push origin main --tags`
5. Create GitHub Release manually from the tag

## Changelog Format

The CHANGELOG.md follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Features that will be removed

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security-related changes
```

## Version Numbering

This project uses [Semantic Versioning](https://semver.org/):

- **Major (X.0.0)**: Breaking changes
- **Minor (0.X.0)**: New features, backwards compatible
- **Patch (0.0.X)**: Bug fixes, backwards compatible

## Pre-releases

For pre-release versions:

```bash
npm run release prerelease --preid=alpha
npm run release prerelease --preid=beta
npm run release prerelease --preid=rc
```

This creates versions like `1.0.0-alpha.0`, `1.0.0-beta.1`, etc.

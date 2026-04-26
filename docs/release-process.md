# Release Process

This document describes the release process for Vibe Island.

## Version Numbering

We use [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

Current version: `0.1.0`

Version numbers are defined in:
- `src-tauri/Cargo.toml` - `version` field
- `src-tauri/tauri.conf.json` - `version` field

Both must be updated together for releases.

## Build Instructions

### Prerequisites

- Rust 1.77+
- Node.js 18+
- Windows 10/11
- Visual Studio Build Tools (for Windows SDK)

### Build Steps

1. Update version numbers in `Cargo.toml` and `tauri.conf.json`
2. Run the build command:
   ```bash
   cd src-tauri
   cargo tauri build
   ```

### Build Outputs

After a successful build, the following files are generated:

| File | Location | Size |
|------|----------|------|
| MSI Installer | `src-tauri/target/release/bundle/msi/Vibe Island_X.X.X_x64_en-US.msi` | ~3.5 MB |
| NSIS Installer | `src-tauri/target/release/bundle/nsis/Vibe Island_X.X.X_x64-setup.exe` | ~2.3 MB |
| Portable EXE | `src-tauri/target/release/app.exe` | ~10 MB |

## Code Signing (Optional)

If you have an EV code signing certificate:

### Using signtool (Windows SDK)

```powershell
# Sign the MSI
signtool sign /f "path\to\certificate.pfx" /p PASSWORD /tr http://timestamp.digicert.com /td SHA256 /fd SHA256 "Vibe Island_X.X.X_x64_en-US.msi"

# Sign the NSIS installer
signtool sign /f "path\to\certificate.pfx" /p PASSWORD /tr http://timestamp.digicert.com /td SHA256 /fd SHA256 "Vibe Island_X.X.X_x64-setup.exe"
```

### Using Azure SignTool (for Azure Key Vault)

```bash
azuresigntool sign -kvt <tenant-id> -kvu <vault-url> -kvc <certificate-name> -tr http://timestamp.digicert.com "installer.exe"
```

### SmartScreen Considerations

- New certificates may trigger SmartScreen warnings until reputation builds
- EV certificates provide immediate reputation
- Consider submitting to Microsoft for pre-approval: https://developer.microsoft.com/microsoft-store/

## GitHub Release

### Create a Tag

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

### Create GitHub Release

1. Go to https://github.com/vibeisland/vibe-island/releases
2. Click "Draft a new release"
3. Select the tag
4. Fill in release notes (copy from CHANGELOG.md)
5. Upload the installers:
   - `Vibe Island_X.X.X_x64_en-US.msi`
   - `Vibe Island_X.X.X_x64-setup.exe`
6. Publish the release

### Release Notes Template

```markdown
# Vibe Island v0.1.0

## What's New
- Initial release
- Feature list...

## Bug Fixes
- ...

## Breaking Changes
- None

## Downloads
| Platform | Download |
|----------|----------|
| Windows (NSIS) | [Vibe Island_0.1.0_x64-setup.exe](link) |
| Windows (MSI) | [Vibe Island_0.1.0_x64_en-US.msi](link) |

## System Requirements
- Windows 10 version 1809 or later
- Windows 11 (recommended)
```

## Testing Checklist

Before release, verify:

- [ ] Build succeeds without errors
- [ ] No critical warnings in build output
- [ ] Installer runs on Windows 10
- [ ] Installer runs on Windows 11
- [ ] App launches after installation
- [ ] Claude Code hooks integration works
- [ ] Multi-session tracking works
- [ ] Approval flow works
- [ ] System tray menu works
- [ ] No crashes or memory leaks

## Post-Release

1. Update documentation if needed
2. Close milestone in GitHub
3. Announce release on social media
4. Update website/download page
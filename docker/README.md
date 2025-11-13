# Polyglot Docker Image

This directory contains the Dockerfile and build scripts for the custom polyglot development image used by the AI Web IDE.

## Features

The polyglot image includes the following language runtimes and tools:

### Languages & Runtimes
- **Node.js 20.x** - JavaScript/TypeScript runtime with npm and tsx
- **Python 3.11** - Python runtime with pip
- **Go 1.21** - Go compiler and runtime
- **Rust (stable)** - Rust compiler (rustc) and Cargo
- **Java 17 (OpenJDK)** - Java runtime and Maven
- **C/C++ (GCC/G++)** - GNU C/C++ compilers
- **Ruby 3.1** - Ruby runtime with Bundler
- **PHP 7.4** - PHP runtime with Composer

### Development Tools
- Git, Vim, Nano, Tmux
- Build essentials (make, cmake, pkg-config)
- Debugging tools (gdb, htop, procps)

## Building the Image

### Local Development

To build the polyglot image locally:

```bash
# Make build script executable
chmod +x docker/build-polyglot.sh

# Build the image
./docker/build-polyglot.sh
```

This will create the `webide-polyglot:latest` image that the SandboxManager uses.

### Manual Build

```bash
docker build -f docker/Dockerfile.polyglot -t webide-polyglot:latest .
```

## Verifying the Image

After building, verify all runtimes are installed:

```bash
# Test Node.js
docker run --rm webide-polyglot:latest node --version

# Test Python
docker run --rm webide-polyglot:latest python3 --version

# Test Go
docker run --rm webide-polyglot:latest go version

# Test Rust
docker run --rm webide-polyglot:latest rustc --version

# Test Java
docker run --rm webide-polyglot:latest java -version

# Test GCC/G++
docker run --rm webide-polyglot:latest gcc --version
docker run --rm webide-polyglot:latest g++ --version

# Test Ruby
docker run --rm webide-polyglot:latest ruby --version

# Test PHP
docker run --rm webide-polyglot:latest php --version
```

## Usage

The polyglot image is automatically used by the SandboxManager when creating workspace containers. Each workspace gets an isolated container based on this image with:

- Workspace files mounted at `/workspace`
- All language runtimes available
- 512MB memory limit (configurable)
- 1 CPU limit (configurable)

## Architecture

The Dockerfile uses multi-stage builds to:
1. Install each runtime in a separate stage
2. Layer installations efficiently
3. Clean up unnecessary files between stages
4. Minimize final image size

## Image Size

Expected image size: ~2-3GB (includes all runtimes and tools)

This is acceptable for a development environment that supports multiple languages. For production, consider:
- Language-specific images for each runtime
- Removing unused runtimes
- Using alpine-based alternatives where possible

## Updating the Image

When updating language versions or adding new tools:

1. Edit `docker/Dockerfile.polyglot`
2. Update version numbers in ENV variables or download URLs
3. Rebuild the image: `./docker/build-polyglot.sh`
4. Test all language runtimes
5. Update this README with new versions

## Troubleshooting

### Image not found

If you see "Error: No such image: webide-polyglot:latest":
```bash
./docker/build-polyglot.sh
```

### Build failures

If the build fails:
1. Check Docker daemon is running
2. Ensure sufficient disk space (>5GB free)
3. Check network connectivity for package downloads
4. Review build logs for specific error messages

### Runtime not working

If a specific runtime doesn't work:
1. Verify installation in the Dockerfile
2. Check PATH environment variables
3. Test the runtime directly:
   ```bash
   docker run -it --rm webide-polyglot:latest /bin/bash
   # Then test the runtime inside the container
   ```

## Development Notes

- Base image: Debian Bullseye (for stability and package availability)
- Workspace directory: `/workspace`
- User: root (containers are isolated and temporary)
- CMD: `/bin/bash` (interactive shell by default)

## Future Enhancements

- [ ] Add language version management (nvm, pyenv, etc.)
- [ ] Include more package managers (yarn, pnpm, poetry)
- [ ] Add database clients (psql, mysql, mongo)
- [ ] Include testing frameworks
- [ ] Reduce image size with alpine alternatives
- [ ] Add CI/CD for automated builds
- [ ] Publish to container registry

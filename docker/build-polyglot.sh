#!/bin/bash
# Build script for polyglot Docker image

set -e

IMAGE_NAME="webide-polyglot"
IMAGE_TAG="latest"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "========================================="
echo "Building Polyglot Development Image"
echo "Image: ${FULL_IMAGE}"
echo "========================================="

# Build the image
docker build \
  -f docker/Dockerfile.polyglot \
  -t ${FULL_IMAGE} \
  --progress=plain \
  .

echo ""
echo "========================================="
echo "Build Complete!"
echo "Image: ${FULL_IMAGE}"
echo "========================================="
echo ""
echo "To test the image:"
echo "  docker run -it --rm ${FULL_IMAGE}"
echo ""
echo "To inspect installed tools:"
echo "  docker run --rm ${FULL_IMAGE} node --version"
echo "  docker run --rm ${FULL_IMAGE} python3 --version"
echo "  docker run --rm ${FULL_IMAGE} go version"
echo "  docker run --rm ${FULL_IMAGE} rustc --version"
echo "  docker run --rm ${FULL_IMAGE} java -version"
echo ""

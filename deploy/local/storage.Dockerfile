FROM golang:1.26-bookworm AS build
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
FROM node:22-bookworm-slim
COPY --from=build /go/bin/minio /usr/local/bin/minio
RUN mkdir /data && chown node:node /data
USER node
ENTRYPOINT ["minio"]
CMD ["server", "/data"]

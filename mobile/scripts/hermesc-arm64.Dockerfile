FROM debian:bookworm-slim@sha256:96e378d7e6531ac9a15ad505478fcc2e69f371b10f5cdf87857c4b8188404716 AS build

ARG HERMES_COMMIT=7f9a871eefeb2c3852365ee80f0b6733ec12ac3b
ARG HERMES_SOURCE_SHA256=439d47add0d646b632a61b6b48515314be459c01e6c14bcab5e7e29223f420c2

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    build-essential \
    ca-certificates \
    cmake \
    curl \
    libicu-dev \
    ninja-build \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /hermes
RUN curl --fail --location --show-error \
      --retry 3 \
      --retry-all-errors \
      --connect-timeout 15 \
      --max-time 300 \
      --output source.tar.gz \
      "https://github.com/facebook/hermes/archive/${HERMES_COMMIT}.tar.gz" \
  && echo "${HERMES_SOURCE_SHA256}  source.tar.gz" | sha256sum --check --strict \
  && mkdir source \
  && tar --extract --gzip --file source.tar.gz --directory source --strip-components=1 \
  && cmake \
      -S source \
      -B build \
      -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DHERMES_ENABLE_TEST_SUITE=OFF \
      -DHERMES_STATIC_LINK=ON \
  && cmake --build build --target hermesc --parallel \
  && ! readelf --program-headers build/bin/hermesc | grep --quiet INTERP

FROM scratch
COPY --from=build /hermes/build/bin/hermesc /hermesc
CMD ["/hermesc", "-version"]

FROM debian:bookworm-slim@sha256:1663827ae94a92b1f374b5daf5fe2bf55303e7e7c61b84ef9663e654224a5857 AS build

ARG HERMES_COMMIT=7f9a871eefeb2c3852365ee80f0b6733ec12ac3b
ARG HERMES_TREE_SHA1=28a5c9aac4e67850a428724db6faad9f7aed27bf
ARG HERMES_ARCHIVE_SHA256=5e5de1a86e02c8f839dbb3c6fcf65f06a62650f9c4dec2f9078ce904daf85ddd
ARG DEBIAN_SNAPSHOT=20260610T000000Z

RUN sed -i \
      -e "s|URIs: http://deb.debian.org/debian$|URIs: http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}|" \
      -e "s|URIs: http://deb.debian.org/debian-security$|URIs: http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}|" \
      /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::Check-Valid-Until=false update \
  && apt-get install --yes --no-install-recommends \
    build-essential=12.9 \
    ca-certificates=20230311+deb12u1 \
    clang-14=1:14.0.6-12 \
    cmake=3.25.1-1 \
    git=1:2.39.5-0+deb12u3 \
    libicu-dev=72.1-3+deb12u1 \
    ninja-build=1.11.1-2~deb12u1 \
    python3=3.11.2-1+b1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /hermes
RUN git init source-repo \
  && git -C source-repo fetch --depth=1 \
      https://github.com/facebook/hermes.git "${HERMES_COMMIT}" \
  && test "$(git -C source-repo rev-parse FETCH_HEAD)" = "${HERMES_COMMIT}" \
  && test "$(git -C source-repo rev-parse 'FETCH_HEAD^{tree}')" = "${HERMES_TREE_SHA1}" \
  && git -C source-repo archive --format=tar FETCH_HEAD >source.tar \
  && echo "${HERMES_ARCHIVE_SHA256}  source.tar" | sha256sum --check --strict \
  && mkdir source \
  && tar --extract --file source.tar --directory source \
  && cmake \
      -S source \
      -B build \
      -G Ninja \
      -DCMAKE_C_COMPILER=clang-14 \
      -DCMAKE_CXX_COMPILER=clang++-14 \
      -DCMAKE_BUILD_TYPE=Release \
      -DHERMES_ENABLE_TEST_SUITE=OFF \
      -DHERMES_STATIC_LINK=ON \
  && cmake --build build --target hermesc --parallel \
  && ! readelf --program-headers build/bin/hermesc | grep --quiet INTERP

FROM scratch
COPY --from=build /hermes/build/bin/hermesc /hermesc
CMD ["/hermesc", "-version"]

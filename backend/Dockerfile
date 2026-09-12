FROM eclipse-temurin:21-jdk AS build

WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/eiredrake/survey_tentacles"

COPY . .

RUN chmod +x gradlew
RUN ./gradlew bootJar --no-daemon

RUN cp "$(find build/libs \
    -maxdepth 1 \
    -type f \
    -name '*.jar' \
    ! -name '*-plain.jar' \
    | head -n 1)" /app/tentacles.jar


FROM eclipse-temurin:21-jre

ENV TENTACLES_UPLOAD_DIR=/app/uploads
ENV TENTACLES_REQUIRE_PERSISTENT_UPLOADS=true

WORKDIR /app

COPY --from=build /app/tentacles.jar tentacles.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "tentacles.jar"]
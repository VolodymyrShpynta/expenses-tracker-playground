FROM amazoncorretto:24.0.2-alpine3.22

LABEL authors="Volodymyr Shpynta"
LABEL module="expenses-tracker-api"
LABEL description="Reactive expense tracking API with Spring WebFlux and R2DBC"

# Create app directory
RUN mkdir /app

# Copy the executable JAR
COPY build/libs/expenses-tracker-api-0.0.1-SNAPSHOT.jar /app/expenses-tracker-api.jar

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# Run the application
CMD ["java", "-jar", "/app/expenses-tracker-api.jar"]

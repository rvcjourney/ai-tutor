package com.aitutor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Port of backend/src/server.js. Spring Boot's own startup sequence already
 * gives the same guarantee server.js's async start() hand-rolled: schema.sql
 * runs (spring.sql.init.mode=always) and all beans — including
 * {@link com.aitutor.engine.ConversationCache}, whose ApplicationRunner loads
 * conversation content — are fully initialized before the embedded Tomcat
 * starts accepting requests. No request can land while the cache is empty.
 */
@SpringBootApplication
public class AiTutorApplication {
    public static void main(String[] args) {
        SpringApplication.run(AiTutorApplication.class, args);
    }
}

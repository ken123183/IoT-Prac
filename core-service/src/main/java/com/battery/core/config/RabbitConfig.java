package com.battery.core.config;

import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    public static final String TELEMETRY_QUEUE = "battery_telemetry";

    @Bean
    public Queue telemetryQueue() {
        return new Queue(TELEMETRY_QUEUE, true); // 持久化隊列
    }

    @Bean
    public org.springframework.amqp.support.converter.MessageConverter jackson2JsonMessageConverter() {
        return new org.springframework.amqp.support.converter.Jackson2JsonMessageConverter();
    }
}

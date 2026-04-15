package com.battery.core.config;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.redisson.config.Config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RedisConfig {

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Bean
    public RedissonClient redissonClient() {
        Config config = new Config();
        // 強制全域使用 StringCodec，確保與 Node.js 100% 兼容，不再產生二進位亂碼
        config.setCodec(new StringCodec());
        config.useSingleServer()
              .setAddress("redis://" + redisHost + ":" + redisPort);
        
        return Redisson.create(config);
    }
}

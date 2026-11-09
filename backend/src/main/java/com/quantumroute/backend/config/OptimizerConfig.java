package com.quantumroute.backend.config;

import com.quantumroute.backend.client.OptimizerClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
@EnableConfigurationProperties(OptimizerProperties.class)
public class OptimizerConfig {

    @Bean
    public RestClient optimizerRestClient(OptimizerProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(props.getConnectTimeoutMs()));
        factory.setReadTimeout(Duration.ofMillis(props.getReadTimeoutMs()));
        return RestClient.builder()
                .baseUrl(props.getBaseUrl())
                .requestFactory(factory)
                .build();
    }

    @Bean
    public OptimizerClient optimizerClient(RestClient optimizerRestClient) {
        return new OptimizerClient(optimizerRestClient);
    }
}

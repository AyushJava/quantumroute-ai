package com.quantumroute.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.executor")
public class ExecutorProperties {

    private int coreSize = 2;
    private int maxSize = 4;
    private int queueCapacity = 50;
    private int awaitTerminationSeconds = 30;

    public int getCoreSize() { return coreSize; }
    public void setCoreSize(int coreSize) { this.coreSize = coreSize; }

    public int getMaxSize() { return maxSize; }
    public void setMaxSize(int maxSize) { this.maxSize = maxSize; }

    public int getQueueCapacity() { return queueCapacity; }
    public void setQueueCapacity(int queueCapacity) { this.queueCapacity = queueCapacity; }

    public int getAwaitTerminationSeconds() { return awaitTerminationSeconds; }
    public void setAwaitTerminationSeconds(int awaitTerminationSeconds) {
        this.awaitTerminationSeconds = awaitTerminationSeconds;
    }
}

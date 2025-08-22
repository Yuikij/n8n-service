/**
 * 性能监控和优化工具
 */

const { ErrorLogger } = require('./errorHandler');

/**
 * 性能监控类
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }
  
  /**
   * 开始计时
   * @param {string} operationId - 操作标识
   */
  start(operationId) {
    this.startTimes.set(operationId, process.hrtime.bigint());
  }
  
  /**
   * 结束计时并记录
   * @param {string} operationId - 操作标识
   * @param {Object} metadata - 附加信息
   */
  end(operationId, metadata = {}) {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      ErrorLogger.warn(`No start time found for operation: ${operationId}`);
      return null;
    }
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
    
    const metric = {
      operationId,
      duration,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    
    // 存储指标
    if (!this.metrics.has(operationId)) {
      this.metrics.set(operationId, []);
    }
    this.metrics.get(operationId).push(metric);
    
    // 清理开始时间
    this.startTimes.delete(operationId);
    
    return metric;
  }
  
  /**
   * 获取操作统计信息
   * @param {string} operationId - 操作标识
   * @returns {Object} 统计信息
   */
  getStats(operationId) {
    const metrics = this.metrics.get(operationId);
    if (!metrics || metrics.length === 0) {
      return null;
    }
    
    const durations = metrics.map(m => m.duration);
    const total = durations.reduce((sum, d) => sum + d, 0);
    const avg = total / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    
    // 计算百分位数
    const sorted = durations.sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    return {
      operationId,
      count: metrics.length,
      total: Math.round(total),
      average: Math.round(avg),
      min: Math.round(min),
      max: Math.round(max),
      p50: Math.round(p50),
      p95: Math.round(p95),
      p99: Math.round(p99)
    };
  }
  
  /**
   * 获取所有操作的统计信息
   * @returns {Array} 统计信息数组
   */
  getAllStats() {
    const stats = [];
    for (const operationId of this.metrics.keys()) {
      stats.push(this.getStats(operationId));
    }
    return stats.sort((a, b) => b.count - a.count);
  }
  
  /**
   * 清理旧的指标数据
   * @param {number} maxAge - 最大保留时间（毫秒）
   */
  cleanup(maxAge = 3600000) { // 默认1小时
    const cutoff = new Date(Date.now() - maxAge);
    
    for (const [operationId, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => new Date(m.timestamp) > cutoff);
      if (filtered.length === 0) {
        this.metrics.delete(operationId);
      } else {
        this.metrics.set(operationId, filtered);
      }
    }
  }
}

// 全局性能监控实例
const perfMonitor = new PerformanceMonitor();

/**
 * 性能监控装饰器
 * @param {string} operationName - 操作名称
 */
function monitor(operationName) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      const operationId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      perfMonitor.start(operationId);
      
      try {
        const result = await originalMethod.apply(this, args);
        
        perfMonitor.end(operationId, {
          success: true,
          args: args.length
        });
        
        return result;
      } catch (error) {
        perfMonitor.end(operationId, {
          success: false,
          error: error.message,
          args: args.length
        });
        
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * 内存使用监控
 */
class MemoryMonitor {
  static getUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // 总内存 (MB)
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // 堆总大小 (MB)
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // 堆使用大小 (MB)
      external: Math.round(usage.external / 1024 / 1024), // 外部内存 (MB)
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // ArrayBuffer (MB)
    };
  }
  
  static logUsage() {
    const usage = this.getUsage();
    ErrorLogger.info('Memory usage', usage);
    return usage;
  }
  
  static checkMemoryLeak(threshold = 500) { // 500MB 阈值
    const usage = this.getUsage();
    if (usage.heapUsed > threshold) {
      ErrorLogger.warn('High memory usage detected', {
        current: usage.heapUsed,
        threshold,
        suggestion: 'Consider running garbage collection or checking for memory leaks'
      });
      
      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
        ErrorLogger.info('Forced garbage collection executed');
      }
    }
    return usage;
  }
}

/**
 * 简单的缓存实现
 */
class SimpleCache {
  constructor(maxSize = 100, ttl = 300000) { // 默认5分钟TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  set(key, value) {
    // 检查大小限制
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的条目
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
  
  // 清理过期条目
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * 性能中间件
 */
function performanceMiddleware(req, res, next) {
  const operationId = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.performanceId = operationId;
  
  perfMonitor.start(operationId);
  
  // 监听响应结束
  res.on('finish', () => {
    perfMonitor.end(operationId, {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent') || 'Unknown'
    });
  });
  
  next();
}

/**
 * 获取性能报告
 */
function getPerformanceReport() {
  return {
    timestamp: new Date().toISOString(),
    memory: MemoryMonitor.getUsage(),
    operations: perfMonitor.getAllStats(),
    uptime: process.uptime()
  };
}

// 定期清理和监控
setInterval(() => {
  perfMonitor.cleanup();
  MemoryMonitor.checkMemoryLeak();
}, 300000); // 每5分钟

module.exports = {
  PerformanceMonitor,
  MemoryMonitor,
  SimpleCache,
  monitor,
  performanceMiddleware,
  getPerformanceReport,
  perfMonitor
};

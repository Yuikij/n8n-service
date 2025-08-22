/**
 * 图片清理服务
 * 负责定时清理过期的图片文件
 */

const fs = require('fs').promises;
const path = require('path');
const { ErrorLogger } = require('../utils/errorHandler');

class CleanupService {
  constructor() {
    this.cleanupInterval = null;
    this.isRunning = false;
    this.config = {
      // 清理目录
      imageDir: path.join(__dirname, '../../public/images'),
      // 文件保留天数（可通过环境变量配置，默认1天）
      retentionDays: parseInt(process.env.CLEANUP_RETENTION_DAYS) || 1,
      // 定时任务时间（每天0点）
      cronTime: '0 0 * * *',
      // 文件名匹配模式
      filePattern: /^reddit_card_.*\.png$/,
      // 是否启用清理（可通过环境变量控制）
      enabled: process.env.CLEANUP_ENABLED !== 'false'
    };
  }

  /**
   * 启动清理服务
   */
  start() {
    if (!this.config.enabled) {
      ErrorLogger.info('Cleanup service is disabled');
      return;
    }

    if (this.isRunning) {
      ErrorLogger.warn('Cleanup service is already running');
      return;
    }

    this.isRunning = true;
    
    // 立即执行一次清理（用于测试和启动时清理）
    this.performCleanup();
    
    // 设置定时任务 - 每天午夜执行
    this.scheduleCleanup();
    
    ErrorLogger.info('Cleanup service started', {
      retentionDays: this.config.retentionDays,
      imageDir: this.config.imageDir,
      enabled: this.config.enabled
    });
  }

  /**
   * 停止清理服务
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    ErrorLogger.info('Cleanup service stopped');
  }

  /**
   * 设置定时任务
   */
  scheduleCleanup() {
    // 计算到下一个午夜的毫秒数
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // 下一个午夜
    
    const timeToMidnight = midnight.getTime() - now.getTime();
    
    // 首次在午夜执行
    setTimeout(() => {
      this.performCleanup();
      
      // 然后每24小时执行一次
      this.cleanupInterval = setInterval(() => {
        this.performCleanup();
      }, 24 * 60 * 60 * 1000); // 24小时
      
    }, timeToMidnight);
    
    ErrorLogger.info('Cleanup scheduled for midnight', {
      nextCleanup: midnight.toISOString(),
      timeToMidnight: Math.round(timeToMidnight / 1000 / 60) + ' minutes'
    });
  }

  /**
   * 执行清理任务
   */
  async performCleanup() {
    try {
      ErrorLogger.info('Starting cleanup task');
      
      const stats = await this.cleanupOldImages();
      
      ErrorLogger.info('Cleanup task completed', {
        filesScanned: stats.filesScanned,
        filesDeleted: stats.filesDeleted,
        filesSkipped: stats.filesSkipped,
        errors: stats.errors,
        totalSizeFreed: this.formatBytes(stats.totalSizeFreed)
      });
      
      return stats;
    } catch (error) {
      ErrorLogger.log(error, 'Cleanup task failed', {
        imageDir: this.config.imageDir,
        retentionDays: this.config.retentionDays
      });
      throw error;
    }
  }

  /**
   * 清理过期图片
   */
  async cleanupOldImages() {
    const stats = {
      filesScanned: 0,
      filesDeleted: 0,
      filesSkipped: 0,
      errors: 0,
      totalSizeFreed: 0
    };

    try {
      // 检查目录是否存在
      await fs.access(this.config.imageDir);
    } catch (error) {
      ErrorLogger.warn('Images directory does not exist', {
        directory: this.config.imageDir
      });
      return stats;
    }

    // 计算截止时间
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffTime);
    
    ErrorLogger.info('Cleanup parameters', {
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: this.config.retentionDays,
      directory: this.config.imageDir
    });

    // 读取目录内容
    const files = await fs.readdir(this.config.imageDir);
    
    for (const filename of files) {
      stats.filesScanned++;
      
      try {
        // 检查文件名是否匹配模式
        if (!this.config.filePattern.test(filename)) {
          stats.filesSkipped++;
          continue;
        }

        const filepath = path.join(this.config.imageDir, filename);
        const fileStat = await fs.stat(filepath);
        
        // 检查文件修改时间
        if (fileStat.mtime.getTime() < cutoffTime) {
          // 删除过期文件
          await fs.unlink(filepath);
          stats.filesDeleted++;
          stats.totalSizeFreed += fileStat.size;
          
          ErrorLogger.info('File deleted', {
            filename,
            fileAge: Math.round((Date.now() - fileStat.mtime.getTime()) / (24 * 60 * 60 * 1000)) + ' days',
            fileSize: this.formatBytes(fileStat.size)
          });
        } else {
          stats.filesSkipped++;
        }
      } catch (error) {
        stats.errors++;
        ErrorLogger.log(error, 'Error processing file', {
          filename,
          directory: this.config.imageDir
        });
      }
    }

    return stats;
  }

  /**
   * 手动触发清理（用于测试或管理接口）
   */
  async manualCleanup() {
    ErrorLogger.info('Manual cleanup triggered');
    return await this.performCleanup();
  }

  /**
   * 获取清理服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: {
        ...this.config,
        nextCleanup: this.getNextCleanupTime()
      }
    };
  }

  /**
   * 获取下次清理时间
   */
  getNextCleanupTime() {
    if (!this.isRunning) return null;
    
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    
    return midnight.toISOString();
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    ErrorLogger.info('Cleanup service config updated', this.config);
  }
}

// 单例模式
const cleanupService = new CleanupService();

module.exports = {
  CleanupService,
  cleanupService
};

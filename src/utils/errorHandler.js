/**
 * 错误处理工具
 * 提供统一的错误处理和日志记录
 */

/**
 * 应用错误类
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误类
 */
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400);
    this.details = details;
    this.type = 'ValidationError';
  }
}

/**
 * 图片生成错误类
 */
class ImageGenerationError extends AppError {
  constructor(message, postId = null) {
    super(message, 500);
    this.postId = postId;
    this.type = 'ImageGenerationError';
  }
}

/**
 * 文件系统错误类
 */
class FileSystemError extends AppError {
  constructor(message, filepath = null) {
    super(message, 500);
    this.filepath = filepath;
    this.type = 'FileSystemError';
  }
}

/**
 * 错误日志记录器
 */
class ErrorLogger {
  static log(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode || 500,
      context,
      ...(error.postId && { postId: error.postId }),
      ...(error.filepath && { filepath: error.filepath }),
      ...(error.details && { details: error.details })
    };
    
    console.error('🚨 Error occurred:', JSON.stringify(logEntry, null, 2));
    
    // 在生产环境中，这里可以集成外部日志服务
    // 如 Winston, Sentry, ELK Stack 等
  }
  
  static warn(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      message,
      context
    };
    
    console.warn('⚠️  Warning:', JSON.stringify(logEntry, null, 2));
  }
  
  static info(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      context
    };
    
    console.log('ℹ️  Info:', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * 错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 设置默认错误信息
  let error = { ...err };
  error.message = err.message;
  
  // 记录错误日志
  ErrorLogger.log(error, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // 验证错误
  if (err.name === 'ValidationError' || err instanceof ValidationError) {
    const message = 'Invalid input data';
    error = new ValidationError(message, err.details);
  }
  
  // Joi验证错误
  if (err.isJoi) {
    const message = 'Invalid input data';
    const details = err.details.map(d => d.message);
    error = new ValidationError(message, details);
  }
  
  // MongoDB错误
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new AppError(message, 404);
  }
  
  // MongoDB重复键错误
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new AppError(message, 400);
  }
  
  // JSON解析错误
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const message = 'Invalid JSON format';
    error = new ValidationError(message);
  }
  
  // 发送错误响应
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    ...(error.details && { details: error.details }),
    ...(error.type && { type: error.type }),
    timestamp: error.timestamp || new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      originalError: err.message 
    })
  });
}

/**
 * 404处理中间件
 */
function notFoundHandler(req, res, next) {
  const message = `Route ${req.originalUrl} not found`;
  const error = new AppError(message, 404);
  next(error);
}

/**
 * 异步错误包装器
 * 自动捕获异步函数中的错误
 */
function asyncErrorHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 重试机制
 * 对可能暂时失败的操作进行重试
 */
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 1) {
        ErrorLogger.info(`Operation succeeded on attempt ${attempt}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      ErrorLogger.warn(`Operation failed on attempt ${attempt}/${maxRetries}`, {
        error: error.message,
        attempt
      });
      
      if (attempt === maxRetries) {
        break;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw new AppError(
    `Operation failed after ${maxRetries} attempts: ${lastError.message}`,
    500
  );
}

/**
 * 优雅关闭处理
 */
function setupGracefulShutdown(server) {
  const shutdown = async (signal) => {
    ErrorLogger.info(`Received ${signal}, starting graceful shutdown`);
    
    try {
      // 关闭HTML渲染器
      const { closeRenderer } = require('../services/htmlRenderer');
      await closeRenderer();
      ErrorLogger.info('HTML renderer closed');
    } catch (error) {
      ErrorLogger.warn('Error closing HTML renderer', { error: error.message });
    }
    
    server.close((err) => {
      if (err) {
        ErrorLogger.log(err);
        process.exit(1);
      }
      
      ErrorLogger.info('Server closed gracefully');
      process.exit(0);
    });
    
    // 强制关闭超时
    setTimeout(() => {
      ErrorLogger.warn('Forcing server shutdown');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  process.on('uncaughtException', (error) => {
    ErrorLogger.log(error, { type: 'uncaughtException' });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    ErrorLogger.log(new Error(`Unhandled Rejection: ${reason}`), {
      type: 'unhandledRejection',
      promise: promise.toString()
    });
    process.exit(1);
  });
}

module.exports = {
  AppError,
  ValidationError,
  ImageGenerationError,
  FileSystemError,
  ErrorLogger,
  errorHandler,
  notFoundHandler,
  asyncErrorHandler,
  retryOperation,
  setupGracefulShutdown
};

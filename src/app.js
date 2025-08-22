const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const cardController = require('./controllers/cardController');
const { 
  errorHandler, 
  notFoundHandler, 
  setupGracefulShutdown,
  ErrorLogger 
} = require('./utils/errorHandler');
const { 
  performanceMiddleware, 
  getPerformanceReport,
  MemoryMonitor 
} = require('./utils/performance');
const { closeRenderer } = require('./services/htmlRenderer');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(helmet()); // 安全中间件
app.use(cors()); // 跨域中间件
app.use(morgan('combined')); // 日志中间件
app.use(performanceMiddleware); // 性能监控中间件
app.use(express.json({ limit: '10mb' })); // JSON解析中间件
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 提供生成的图片
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// 健康检查接口
app.get('/health', (req, res) => {
  const memoryUsage = MemoryMonitor.getUsage();
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'reddit-card-generator',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: memoryUsage
  });
});

// 性能监控接口
app.get('/metrics', (req, res) => {
  const report = getPerformanceReport();
  res.json(report);
});

// API路由
app.use('/api', cardController);

// 404处理
app.use('*', notFoundHandler);

// 全局错误处理中间件
app.use(errorHandler);

// 启动服务器
const server = app.listen(PORT, () => {
  ErrorLogger.info('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: `http://localhost:${PORT}/health`,
      generateCards: `http://localhost:${PORT}/api/generate-cards`,
      images: `http://localhost:${PORT}/images/`
    }
  });
  
  console.log(`🚀 Reddit Card Generator Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🎨 Generate cards: http://localhost:${PORT}/api/generate-cards`);
  console.log(`🖼️  Images served at: http://localhost:${PORT}/images/`);
});

// 设置优雅关闭
setupGracefulShutdown(server);

module.exports = app;

# Reddit Card Generator

一个将Reddit热门帖子转换为精美卡片图片的Node.js服务。

## 🌟 功能特点

- 📱 **竖版3:4比例卡片设计** - 适合移动端分享
- 🎨 **Reddit风格样式** - 左上角Reddit图标，橙色主题
- 🌏 **中英文混排支持** - 智能文字排版和换行
- 📄 **智能内容分页** - 根据内容长度自动生成2-4张图片
- 💬 **评论卡片** - 高赞评论单独渲染
- ⚡ **高性能生成** - 基于HTML+CSS的精美图片生成
- 🧹 **自动清理机制** - 每天0点自动删除过期图片文件

## 🏗️ 技术架构

- **后端框架**: Node.js + Express.js
- **图片生成**: HTML + CSS + Puppeteer
- **模板引擎**: Handlebars + 精美CSS样式
- **渲染引擎**: Puppeteer无头浏览器
- **文字处理**: 智能中英文混排算法

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

\`\`\`bash
npm install
\`\`\`

### 启动服务

\`\`\`bash
# 开发模式
npm run dev

# 生产模式
npm start
\`\`\`

服务启动后访问：
- 健康检查: http://localhost:3000/health
- API文档: http://localhost:3000/api/info
- 生成接口: http://localhost:3000/api/generate-cards
- 清理状态: http://localhost:3000/cleanup/status
- 手动清理: http://localhost:3000/cleanup/manual (POST)

## 🔧 Systemd 服务管理

### 创建系统服务

1. **创建服务文件**

```bash
sudo nano /etc/systemd/system/reddit-card-service.service
```

2. **配置服务文件内容**

```ini
[Unit]
Description=Reddit Card Generator Service
Documentation=https://github.com/your-username/n8n-service
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/reddit-card-service
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

# 安全设置
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/reddit-card-service/public/images

# 资源限制
LimitNOFILE=65536
LimitNPROC=4096

# 日志设置
StandardOutput=journal
StandardError=journal
SyslogIdentifier=reddit-card-service

[Install]
WantedBy=multi-user.target
```

3. **部署应用程序**

```bash
# 创建应用目录
sudo mkdir -p /opt/reddit-card-service
sudo chown www-data:www-data /opt/reddit-card-service

# 复制应用文件（在项目目录中执行）
sudo cp -r src/ package.json /opt/reddit-card-service/
sudo mkdir -p /opt/reddit-card-service/public/images
sudo chown -R www-data:www-data /opt/reddit-card-service

# 安装依赖
cd /opt/reddit-card-service
sudo -u www-data npm install --production
```

4. **启用并启动服务**

```bash
# 重新加载systemd配置
sudo systemctl daemon-reload

# 启用服务（开机自启）
sudo systemctl enable reddit-card-service

# 启动服务
sudo systemctl start reddit-card-service

# 检查服务状态
sudo systemctl status reddit-card-service
```

### 服务管理命令

```bash
# 启动服务
sudo systemctl start reddit-card-service

# 停止服务
sudo systemctl stop reddit-card-service

# 重启服务
sudo systemctl restart reddit-card-service

# 重新加载配置（不中断服务）
sudo systemctl reload reddit-card-service

# 查看服务状态
sudo systemctl status reddit-card-service

# 查看服务日志
sudo journalctl -u reddit-card-service

# 查看实时日志
sudo journalctl -u reddit-card-service -f

# 查看最近的日志
sudo journalctl -u reddit-card-service --since "1 hour ago"

# 禁用开机自启
sudo systemctl disable reddit-card-service
```

### 日志管理

```bash
# 查看所有日志
sudo journalctl -u reddit-card-service

# 查看最近50行日志
sudo journalctl -u reddit-card-service -n 50

# 查看指定时间范围的日志
sudo journalctl -u reddit-card-service --since "2023-12-01" --until "2023-12-02"

# 清理日志（保留最近7天）
sudo journalctl --vacuum-time=7d

# 限制日志文件大小（最大100MB）
sudo journalctl --vacuum-size=100M
```

### 环境变量配置

编辑服务文件添加更多环境变量：

```bash
sudo systemctl edit reddit-card-service
```

在打开的编辑器中添加：

```ini
[Service]
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=LOG_LEVEL=info
Environment=MAX_MEMORY=1024
Environment=PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox
Environment=CLEANUP_ENABLED=true
Environment=CLEANUP_RETENTION_DAYS=1
```

## 🧹 图片清理服务

服务内置了自动清理机制，每天凌晨0点自动删除过期的图片文件，帮助节约磁盘空间。

### 配置选项

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CLEANUP_ENABLED` | `true` | 是否启用自动清理功能 |
| `CLEANUP_RETENTION_DAYS` | `1` | 图片文件保留天数 |

### 清理策略

- 🕛 **执行时间**: 每天凌晨0点自动执行
- 📁 **清理目录**: `public/images/` 目录
- 🔍 **文件匹配**: 只清理符合 `reddit_card_*.png` 模式的文件
- ⏰ **保留期限**: 根据文件修改时间计算，超过保留天数的文件将被删除

### 管理接口

```bash
# 查看清理服务状态
curl http://localhost:3000/cleanup/status

# 手动触发清理（用于测试）
curl -X POST http://localhost:3000/cleanup/manual
```

### 清理日志

清理操作会记录详细的日志信息，包括：
- 扫描的文件数量
- 删除的文件数量
- 释放的磁盘空间
- 错误信息（如有）

### 监控和维护

```bash
# 检查服务是否在运行
systemctl is-active reddit-card-service

# 检查服务是否启用
systemctl is-enabled reddit-card-service

# 查看服务配置
systemctl cat reddit-card-service

# 测试配置文件语法
sudo systemd-analyze verify /etc/systemd/system/reddit-card-service.service
```

### 故障排除

1. **服务启动失败**
```bash
# 查看详细错误信息
sudo systemctl status reddit-card-service -l
sudo journalctl -u reddit-card-service --no-pager
```

2. **权限问题**
```bash
# 确保文件权限正确
sudo chown -R www-data:www-data /opt/reddit-card-service
sudo chmod +x /opt/reddit-card-service/src/app.js
```

3. **端口占用**
```bash
# 检查端口是否被占用
sudo netstat -tlnp | grep :3000
```

4. **内存不足**
```bash
# 增加内存限制
sudo systemctl edit reddit-card-service
# 添加: Environment=NODE_OPTIONS=--max-old-space-size=2048
```

## 📡 API接口

### POST /api/generate-cards

生成Reddit帖子卡片图片

**请求体示例：**

\`\`\`json
{
  "postList": [
    {
      "id": "reddit_post_id",
      "title": "Amazing Discovery in Science",
      "title_polish_zh": "科学领域的惊人发现",
      "title_zh": "科学中的惊人发现",
      "subreddit": "science",
      "selftext": "Post content here...",
      "selftext_zh": "帖子内容的中文翻译...",
      "created": 1703123456,
      "ups": 15420,
      "name": "t3_post_name",
      "summary_zh": "帖子的中文总结",
      "commentList": [
        {
          "author": "username",
          "body": "Comment content...",
          "body_zh": "评论的中文翻译...",
          "parent_id": "",
          "ups": 100,
          "icon_img": ""
        }
      ]
    }
  ]
}
\`\`\`

**响应示例：**

\`\`\`json
{
  "success": true,
  "data": {
    "results": [
      {
        "postId": "reddit_post_id",
        "imageUrls": [
          "http://localhost:3000/images/reddit_card_post_001_1234567890_1.png",
          "http://localhost:3000/images/reddit_card_post_001_1234567890_2.png"
        ],
        "imageCount": 2
      }
    ],
    "totalPosts": 1,
    "totalImages": 2,
    "generatedAt": "2025-08-22T09:21:24.561Z"
  },
  "stats": {
    "totalPosts": 1,
    "totalImages": 2,
    "avgImagesPerPost": 2,
    "cardTypeDistribution": {
      "main": 1,
      "comments": 1
    }
  }
}
\`\`\`

## 🧪 测试

使用提供的测试数据：

\`\`\`bash
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/api/generate-cards" -Method Post -ContentType "application/json" -InFile "test-data.json"

# Linux/macOS
curl -X POST http://localhost:3000/api/generate-cards -H "Content-Type: application/json" -d @test-data.json
\`\`\`

## 📁 项目结构

\`\`\`
n8n-service/
├── src/
│   ├── controllers/          # API控制器
│   │   └── cardController.js
│   ├── services/             # 业务逻辑
│   │   ├── imageGenerator.js # 图片生成服务
│   │   └── htmlRenderer.js   # HTML渲染引擎
│   ├── templates/            # 模板文件
│   │   ├── html/             # HTML模板
│   │   │   ├── main-card.hbs
│   │   │   └── comment-card.hbs
│   │   └── css/              # CSS样式
│   │       └── base.css
│   ├── utils/                # 工具函数
│   │   ├── textUtils.js      # 文字处理
│   │   ├── errorHandler.js   # 错误处理
│   │   └── performance.js    # 性能监控
│   └── app.js                # 应用入口
├── public/                   # 静态文件
│   └── images/               # 生成的图片
├── test-data.json            # 测试数据
├── package.json
└── README.md
\`\`\`

## 🎨 卡片样式

### 主帖卡片
- Reddit图标和"Reddit高赞讨论"标识
- 中文标题（大字体，粗体）
- 英文原标题（小字体，浅色）
- 中文正文内容
- 点赞数显示
- 生成时间戳

### 评论卡片
- 原帖标题引用
- 评论作者和点赞数
- 评论内容（中英文）
- 卡片阴影效果

## ⚙️ 配置选项

### Canvas配置
- 画布尺寸: 900x1200 (3:4比例)
- 背景色: 白色
- 边距: 32px
- 字体: Inter, Arial

### 分页逻辑
- 最小页数: 2页
- 最大页数: 4页
- 每页最大字符数: 600
- 每页最大评论数: 2条

### 颜色主题
- Reddit橙色: #ff4500
- Reddit蓝色: #0079d3
- 主文本: #1a1a1a
- 辅助文本: #666666

## 🚦 错误处理

服务包含完整的错误处理机制：

- 输入数据验证
- 图片生成失败重试
- 部分失败容错处理
- 详细错误日志

## 📊 性能指标

- 单张卡片生成时间: ~2秒
- 支持批量处理
- 内存优化处理
- 文件自动清理

## 🔧 开发指南

### 添加新模板

1. 在 \`src/templates/html/\` 中创建新的.hbs模板文件
2. 在 \`src/templates/css/\` 中添加对应的CSS样式
3. 在 \`src/services/htmlRenderer.js\` 中注册新模板
4. 测试新模板的渲染效果

### 自定义样式

修改 \`src/templates/css/base.css\` 中的CSS变量：
- \`:root\` 中的颜色变量
- 字体大小和间距变量
- 布局和响应式规则

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**生成的图片示例**: 检查 \`public/images/\` 目录查看生成的卡片图片。

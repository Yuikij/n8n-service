# Reddit Card Generator

一个将Reddit热门帖子转换为精美卡片图片的Node.js服务。

## 🌟 功能特点

- 📱 **竖版3:4比例卡片设计** - 适合移动端分享
- 🎨 **Reddit风格样式** - 左上角Reddit图标，橙色主题
- 🌏 **中英文混排支持** - 智能文字排版和换行
- 📄 **智能内容分页** - 根据内容长度自动生成2-4张图片
- 💬 **评论卡片** - 高赞评论单独渲染
- ⚡ **高性能生成** - 基于HTML+CSS的精美图片生成

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
- 画布尺寸: 750x1000 (3:4比例)
- 背景色: 白色
- 边距: 40px
- 字体: Arial

### 分页逻辑
- 最小页数: 2页
- 最大页数: 4页
- 每页最大字符数: 800
- 每页最大评论数: 3条

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

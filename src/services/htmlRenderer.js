/**
 * HTML渲染器服务
 * 使用Handlebars模板引擎和Puppeteer将HTML转换为图片
 */

const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { ErrorLogger } = require('../utils/errorHandler');

/**
 * HTML渲染器类
 */
class HTMLRenderer {
  constructor() {
    this.browser = null;
    this.templates = new Map();
    this.compiledTemplates = new Map();
    this.setupHelpers();
  }

  /**
   * 设置Handlebars助手函数
   */
  setupHelpers() {
    // 格式化数字（如点赞数）
    handlebars.registerHelper('formatNumber', (number) => {
      if (number >= 1000000) {
        return (number / 1000000).toFixed(1) + 'M';
      } else if (number >= 1000) {
        return (number / 1000).toFixed(1) + 'K';
      }
      return number.toString();
    });

    // 获取当前日期
    handlebars.registerHelper('currentDate', () => {
      return new Date().toLocaleDateString('zh-CN');
    });

    // 文本截断
    handlebars.registerHelper('truncate', (text, length) => {
      if (!text || text.length <= length) return text;
      return text.substring(0, length) + '...';
    });

    // 段落分割
    handlebars.registerHelper('paragraphs', (text) => {
      if (!text) return [];
      return text.split('\n').filter(p => p.trim().length > 0);
    });

    // 条件判断
    handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
      switch (operator) {
        case '==':
          return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
          return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
          return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
          return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
          return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
          return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
          return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
          return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        default:
          return options.inverse(this);
      }
    });

    // 字符串截取
    handlebars.registerHelper('substr', function(str, start, length) {
      if (!str) return '';
      if (length !== undefined) {
        return str.substr(start, length).toUpperCase();
      }
      return str.substr(start).toUpperCase();
    });
  }

  /**
   * 初始化浏览器
   */
  async initBrowser() {
    if (this.browser) {
      return this.browser;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      ErrorLogger.info('Puppeteer browser initialized successfully');
      return this.browser;
    } catch (error) {
      ErrorLogger.log(error, { context: 'initBrowser' });
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }
  }

  /**
   * 加载HTML模板
   * @param {string} templateName - 模板名称
   * @returns {Promise<string>} 模板内容
   */
  async loadTemplate(templateName) {
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName);
    }

    try {
      const templatePath = path.join(__dirname, '../templates/html', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      
      this.templates.set(templateName, templateContent);
      return templateContent;
    } catch (error) {
      ErrorLogger.log(error, { templateName, context: 'loadTemplate' });
      throw new Error(`Failed to load template ${templateName}: ${error.message}`);
    }
  }

  /**
   * 编译模板
   * @param {string} templateName - 模板名称
   * @returns {Promise<Function>} 编译后的模板函数
   */
  async compileTemplate(templateName) {
    if (this.compiledTemplates.has(templateName)) {
      return this.compiledTemplates.get(templateName);
    }

    try {
      const templateContent = await this.loadTemplate(templateName);
      const compiled = handlebars.compile(templateContent);
      
      this.compiledTemplates.set(templateName, compiled);
      return compiled;
    } catch (error) {
      ErrorLogger.log(error, { templateName, context: 'compileTemplate' });
      throw new Error(`Failed to compile template ${templateName}: ${error.message}`);
    }
  }

  /**
   * 预处理数据，添加段落分割等
   * @param {Object} data - 原始数据
   * @returns {Object} 处理后的数据
   */
  preprocessData(data) {
    const processed = { ...data };

    // 处理内容分段
    if (processed.content_zh) {
      processed.content_zh_paragraphs = processed.content_zh
        .split('\n')
        .filter(p => p.trim().length > 0)
        .slice(0, 6); // 最多6个段落
    }

    if (processed.summary_zh) {
      processed.summary_zh_paragraphs = processed.summary_zh
        .split('\n')
        .filter(p => p.trim().length > 0)
        .slice(0, 4); // 最多4个段落
    }

    if (processed.content) {
      processed.content_paragraphs = processed.content
        .split('\n')
        .filter(p => p.trim().length > 0)
        .slice(0, 5); // 最多5个段落
    }

    // 处理评论数据
    if (processed.comments && Array.isArray(processed.comments)) {
      processed.comments = processed.comments.slice(0, 3).map(comment => ({
        ...comment,
        body_zh: comment.body_zh || comment.body,
        body: comment.body_zh ? comment.body : null // 如果有中文就隐藏英文
      }));
    }

    return processed;
  }

  /**
   * 渲染HTML内容
   * @param {string} templateName - 模板名称
   * @param {Object} data - 数据
   * @returns {Promise<string>} 渲染后的HTML
   */
  async renderHTML(templateName, data) {
    try {
      const template = await this.compileTemplate(templateName);
      const processedData = this.preprocessData(data);
      
      const html = template(processedData);
      return html;
    } catch (error) {
      ErrorLogger.log(error, { templateName, context: 'renderHTML' });
      throw new Error(`Failed to render HTML: ${error.message}`);
    }
  }

  /**
   * 将HTML转换为图片
   * @param {string} html - HTML内容
   * @param {Object} options - 渲染选项
   * @returns {Promise<Buffer>} 图片Buffer
   */
  async htmlToImage(html, options = {}) {
    const {
      width = 750,
      height = 1000,
      deviceScaleFactor = 2,
      quality = 90,
      autoHeight = true  // 新增：自动计算高度
    } = options;

    let page = null;

    try {
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // 设置一个较大的初始视口，用于测量内容
      await page.setViewport({
        width,
        height: Math.max(height, 2000), // 确保有足够空间
        deviceScaleFactor
      });

      // 加载CSS文件路径
      const cssPath = path.join(__dirname, '../templates/css/base.css');
      const cssContent = await fs.readFile(cssPath, 'utf-8');

      // 构建完整的HTML，内联CSS
      const fullHTML = html.replace(
        '<link rel="stylesheet" href="../css/base.css">',
        `<style>${cssContent}</style>`
      );

      // 设置HTML内容
      await page.setContent(fullHTML, {
        waitUntil: ['networkidle0', 'domcontentloaded']
      });

      // 等待字体加载
      await page.evaluateHandle('document.fonts.ready');

      let actualHeight = height;
      
      if (autoHeight) {
        // 测量实际内容高度
        actualHeight = await page.evaluate(() => {
          const body = document.body;
          const card = document.querySelector('.card');
          if (card && body) {
            // 获取body的完整高度
            const bodyRect = body.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const cardScrollHeight = card.scrollHeight;
            const cardOffsetHeight = card.offsetHeight;
            
            // 计算body的padding
            const bodyStyle = window.getComputedStyle(body);
            const bodyPaddingTop = parseFloat(bodyStyle.paddingTop) || 0;
            const bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
            
            // 计算实际需要的高度
            const cardHeight = Math.max(cardRect.height, cardScrollHeight, cardOffsetHeight);
            const totalHeight = cardHeight + bodyPaddingTop + bodyPaddingBottom;
            
            console.log('Card height measurements:', {
              bodyHeight: bodyRect.height,
              cardBoundingRect: cardRect.height,
              cardScrollHeight,
              cardOffsetHeight,
              bodyPaddingTop,
              bodyPaddingBottom,
              calculatedTotal: totalHeight
            });
            
            // 使用计算出的总高度，并添加一些安全边距
            return totalHeight + 20;
          }
          return 1200; // 默认高度
        });
        
        console.log(`🎯 Auto-calculated image height: ${actualHeight}`);
        
        // 限制最大高度以避免过大的图片
        actualHeight = Math.min(actualHeight, 3000);
        actualHeight = Math.max(actualHeight, 400); // 确保最小高度
      }

      // 截图
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width,
          height: actualHeight
        },
        omitBackground: false
      });

      return screenshot;

    } catch (error) {
      ErrorLogger.log(error, { context: 'htmlToImage' });
      throw new Error(`Failed to convert HTML to image: ${error.message}`);
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * 渲染卡片并生成图片
   * @param {string} templateName - 模板名称
   * @param {Object} data - 数据
   * @param {Object} options - 渲染选项
   * @returns {Promise<Buffer>} 图片Buffer
   */
  async renderCard(templateName, data, options = {}) {
    try {
      ErrorLogger.info(`Rendering card with template: ${templateName}`, {
        dataKeys: Object.keys(data)
      });

      const html = await this.renderHTML(templateName, data);
      const imageBuffer = await this.htmlToImage(html, options);

      ErrorLogger.info(`Card rendered successfully`, {
        templateName,
        imageSize: imageBuffer.length
      });

      return imageBuffer;
    } catch (error) {
      ErrorLogger.log(error, { templateName, context: 'renderCard' });
      throw error;
    }
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      ErrorLogger.info('Puppeteer browser closed');
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.templates.clear();
    this.compiledTemplates.clear();
    ErrorLogger.info('Template cache cleared');
  }
}

// 单例实例
let rendererInstance = null;

/**
 * 获取渲染器实例
 * @returns {HTMLRenderer}
 */
function getRenderer() {
  if (!rendererInstance) {
    rendererInstance = new HTMLRenderer();
  }
  return rendererInstance;
}

/**
 * 关闭渲染器
 */
async function closeRenderer() {
  if (rendererInstance) {
    await rendererInstance.close();
    rendererInstance = null;
  }
}

module.exports = {
  HTMLRenderer,
  getRenderer,
  closeRenderer
};

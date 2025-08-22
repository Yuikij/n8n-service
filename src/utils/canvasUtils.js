const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');
const fs = require('fs').promises;
const path = require('path');

/**
 * Canvas配置常量
 */
const CANVAS_CONFIG = {
  width: 750,    // 3:4比例
  height: 1000,
  backgroundColor: '#ffffff',
  quality: 0.9
};

/**
 * 颜色主题配置
 */
const COLORS = {
  background: '#ffffff',
  primary: '#ff4500',      // Reddit橙色
  secondary: '#0079d3',    // Reddit蓝色
  text: {
    primary: '#1a1a1a',
    secondary: '#333333',
    meta: '#666666',
    light: '#999999'
  },
  border: '#e0e0e0',
  shadow: 'rgba(0, 0, 0, 0.1)'
};

/**
 * 字体配置
 */
const FONTS = {
  title: {
    size: 28,
    weight: 'bold',
    family: 'Arial, sans-serif'
  },
  body: {
    size: 20,
    weight: 'normal', 
    family: 'Arial, sans-serif'
  },
  meta: {
    size: 16,
    weight: 'normal',
    family: 'Arial, sans-serif'
  },
  small: {
    size: 14,
    weight: 'normal',
    family: 'Arial, sans-serif'
  }
};

/**
 * 布局配置
 */
const LAYOUT = {
  padding: 40,
  header: {
    height: 80,
    padding: 20
  },
  content: {
    lineHeight: 1.5,
    maxLines: 15,
    spacing: 20
  },
  footer: {
    height: 60,
    padding: 15
  }
};

/**
 * 创建画布
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @returns {Object} 画布对象和上下文
 */
function createCardCanvas(width = CANVAS_CONFIG.width, height = CANVAS_CONFIG.height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // 设置高质量渲染
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  return { canvas, ctx };
}

/**
 * 绘制背景
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {string} color - 背景颜色
 */
function drawBackground(ctx, width, height, color = COLORS.background) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

/**
 * 绘制圆角矩形
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {number} radius - 圆角半径
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * 绘制阴影
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {number} blur - 模糊程度
 */
function drawShadow(ctx, x, y, width, height, blur = 10) {
  ctx.save();
  ctx.shadowColor = COLORS.shadow;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  
  drawRoundedRect(ctx, x, y, width, height, 8);
  ctx.fillStyle = COLORS.background;
  ctx.fill();
  
  ctx.restore();
}

/**
 * 设置字体样式
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Object} fontConfig - 字体配置
 */
function setFont(ctx, fontConfig) {
  const { size, weight, family } = fontConfig;
  ctx.font = `${weight} ${size}px ${family}`;
}

/**
 * 绘制文本
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {string} text - 文本内容
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {Object} options - 绘制选项
 */
function drawText(ctx, text, x, y, options = {}) {
  const {
    color = COLORS.text.primary,
    maxWidth,
    align = 'left',
    baseline = 'top'
  } = options;
  
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  
  if (maxWidth) {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

/**
 * 测量文本宽度
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {string} text - 文本内容
 * @returns {number} 文本宽度
 */
function measureText(ctx, text) {
  return ctx.measureText(text).width;
}

/**
 * 绘制Reddit图标区域
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 */
function drawRedditIcon(ctx, x, y) {
  // 绘制Reddit图标背景圆圈
  ctx.beginPath();
  ctx.arc(x + 20, y + 20, 18, 0, 2 * Math.PI);
  ctx.fillStyle = COLORS.primary;
  ctx.fill();
  
  // 绘制"R"字母
  setFont(ctx, { size: 16, weight: 'bold', family: 'Arial' });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', x + 20, y + 20);
  
  // 重置文本对齐
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

/**
 * 绘制点赞图标和数字
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {number} ups - 点赞数
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 */
function drawUpvotes(ctx, ups, x, y) {
  // 绘制向上箭头
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x + 8, y);
  ctx.lineTo(x + 16, y + 8);
  ctx.lineTo(x + 12, y + 8);
  ctx.lineTo(x + 12, y + 16);
  ctx.lineTo(x + 4, y + 16);
  ctx.lineTo(x + 4, y + 8);
  ctx.closePath();
  ctx.fillStyle = COLORS.primary;
  ctx.fill();
  
  // 绘制点赞数
  setFont(ctx, FONTS.meta);
  const upsText = ups >= 1000 ? `${(ups / 1000).toFixed(1)}k` : ups.toString();
  drawText(ctx, upsText, x + 24, y, { color: COLORS.text.meta });
}

/**
 * 保存画布为图片文件
 * @param {Canvas} canvas - 画布对象
 * @param {string} filepath - 文件路径
 * @returns {Promise<void>}
 */
async function saveCanvasToFile(canvas, filepath) {
  try {
    // 确保目录存在
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });
    
    // 导出为PNG格式
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(filepath, buffer);
    
    console.log(`💾 Image saved: ${filepath}`);
  } catch (error) {
    console.error(`Failed to save image: ${filepath}`, error);
    throw error;
  }
}

/**
 * 获取配置常量
 */
function getConfig() {
  return {
    CANVAS_CONFIG,
    COLORS,
    FONTS,
    LAYOUT
  };
}

module.exports = {
  createCardCanvas,
  drawBackground,
  drawRoundedRect,
  drawShadow,
  setFont,
  drawText,
  measureText,
  drawRedditIcon,
  drawUpvotes,
  saveCanvasToFile,
  getConfig
};

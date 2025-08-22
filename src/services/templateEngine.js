/**
 * 模板引擎
 * 负责渲染不同类型的卡片模板
 */

const canvasUtils = require('../utils/canvasUtils');
const textUtils = require('../utils/textUtils');

const {
  createCardCanvas,
  drawBackground,
  drawShadow,
  setFont,
  drawText,
  measureText,
  drawRedditIcon,
  drawUpvotes,
  getConfig
} = canvasUtils;

const {
  wrapText,
  calculateLineHeight,
  calculateTextHeight,
  truncateText,
  cleanText,
  formatTimestamp
} = textUtils;

const { CANVAS_CONFIG, COLORS, FONTS, LAYOUT } = getConfig();

/**
 * 渲染主帖卡片
 * @param {Object} pageData - 页面数据
 * @returns {Canvas} 渲染完成的画布
 */
function renderMainCard(pageData) {
  const { canvas, ctx } = createCardCanvas();
  const { width, height } = CANVAS_CONFIG;
  
  // 绘制背景
  drawBackground(ctx, width, height);
  
  let currentY = LAYOUT.padding;
  
  // 绘制Header区域
  currentY = drawHeader(ctx, pageData, currentY);
  
  // 绘制标题
  currentY = drawTitle(ctx, pageData, currentY);
  
  // 绘制正文内容
  currentY = drawContent(ctx, pageData, currentY);
  
  // 绘制Footer信息
  drawFooter(ctx, pageData, height - LAYOUT.footer.height - LAYOUT.padding);
  
  return canvas;
}

/**
 * 渲染评论卡片
 * @param {Object} pageData - 页面数据
 * @returns {Canvas} 渲染完成的画布
 */
function renderCommentCard(pageData) {
  const { canvas, ctx } = createCardCanvas();
  const { width, height } = CANVAS_CONFIG;
  
  // 绘制背景
  drawBackground(ctx, width, height);
  
  let currentY = LAYOUT.padding;
  
  // 绘制Header
  currentY = drawHeader(ctx, pageData, currentY);
  
  // 绘制原帖标题（简化版）
  if (pageData.title) {
    setFont(ctx, FONTS.body);
    const titleLines = wrapText(ctx, pageData.title, width - LAYOUT.padding * 2, 2);
    
    drawText(ctx, '原帖: ', LAYOUT.padding, currentY, { 
      color: COLORS.text.meta 
    });
    currentY += calculateLineHeight(FONTS.meta);
    
    titleLines.forEach(line => {
      drawText(ctx, line, LAYOUT.padding, currentY, { 
        color: COLORS.text.secondary 
      });
      currentY += calculateLineHeight(FONTS.body);
    });
    
    currentY += LAYOUT.content.spacing;
  }
  
  // 绘制评论列表
  currentY = drawComments(ctx, pageData.comments, currentY, width, height);
  
  return canvas;
}

/**
 * 绘制Header区域
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Object} pageData - 页面数据
 * @param {number} startY - 起始Y坐标
 * @returns {number} 下一个元素的Y坐标
 */
function drawHeader(ctx, pageData, startY) {
  // 绘制Reddit图标
  drawRedditIcon(ctx, LAYOUT.padding, startY);
  
  // 绘制"Reddit高赞讨论"文字
  setFont(ctx, FONTS.meta);
  drawText(ctx, 'Reddit 高赞讨论', LAYOUT.padding + 50, startY + 5, {
    color: COLORS.primary
  });
  
  // 绘制subreddit信息
  if (pageData.subreddit) {
    const subredditText = `r/${pageData.subreddit}`;
    const textWidth = measureText(ctx, 'Reddit 高赞讨论');
    drawText(ctx, subredditText, LAYOUT.padding + 50 + textWidth + 20, startY + 5, {
      color: COLORS.text.meta
    });
  }
  
  // 绘制分割线
  const lineY = startY + LAYOUT.header.height - 10;
  ctx.beginPath();
  ctx.moveTo(LAYOUT.padding, lineY);
  ctx.lineTo(CANVAS_CONFIG.width - LAYOUT.padding, lineY);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  return startY + LAYOUT.header.height;
}

/**
 * 绘制标题
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Object} pageData - 页面数据
 * @param {number} startY - 起始Y坐标
 * @returns {number} 下一个元素的Y坐标
 */
function drawTitle(ctx, pageData, startY) {
  let currentY = startY;
  const maxWidth = CANVAS_CONFIG.width - LAYOUT.padding * 2;
  
  // 绘制中文标题（优先显示润色版本）
  const chineseTitle = pageData.title_zh || pageData.title;
  if (chineseTitle) {
    setFont(ctx, FONTS.title);
    const titleLines = wrapText(ctx, chineseTitle, maxWidth, 3);
    
    titleLines.forEach((line, index) => {
      drawText(ctx, line, LAYOUT.padding, currentY, {
        color: COLORS.text.primary
      });
      currentY += calculateLineHeight(FONTS.title);
    });
    
    currentY += LAYOUT.content.spacing / 2;
  }
  
  // 绘制英文原标题（小字）
  if (pageData.title && pageData.title !== chineseTitle) {
    setFont(ctx, FONTS.small);
    const originalLines = wrapText(ctx, pageData.title, maxWidth, 2);
    
    originalLines.forEach(line => {
      drawText(ctx, line, LAYOUT.padding, currentY, {
        color: COLORS.text.light
      });
      currentY += calculateLineHeight(FONTS.small);
    });
  }
  
  return currentY + LAYOUT.content.spacing;
}

/**
 * 绘制正文内容
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Object} pageData - 页面数据
 * @param {number} startY - 起始Y坐标
 * @returns {number} 下一个元素的Y坐标
 */
function drawContent(ctx, pageData, startY) {
  let currentY = startY;
  const maxWidth = CANVAS_CONFIG.width - LAYOUT.padding * 2;
  const availableHeight = CANVAS_CONFIG.height - currentY - LAYOUT.footer.height - LAYOUT.padding * 2;
  
  // 优先显示中文内容
  const content = pageData.content_zh || pageData.summary || pageData.content;
  
  if (content && content.trim()) {
    setFont(ctx, FONTS.body);
    
    // 计算可显示的最大行数
    const lineHeight = calculateLineHeight(FONTS.body);
    const maxLines = Math.floor(availableHeight / lineHeight) - 2; // 留一些余量
    
    const contentLines = wrapText(ctx, cleanText(content), maxWidth, maxLines);
    
    contentLines.forEach(line => {
      drawText(ctx, line, LAYOUT.padding, currentY, {
        color: COLORS.text.secondary
      });
      currentY += lineHeight;
    });
  }
  
  return currentY;
}

/**
 * 绘制评论列表
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Array} comments - 评论数据数组
 * @param {number} startY - 起始Y坐标
 * @param {number} canvasWidth - 画布宽度
 * @param {number} canvasHeight - 画布高度
 * @returns {number} 下一个元素的Y坐标
 */
function drawComments(ctx, comments, startY, canvasWidth, canvasHeight) {
  let currentY = startY;
  const maxWidth = canvasWidth - LAYOUT.padding * 2;
  const availableHeight = canvasHeight - currentY - LAYOUT.padding;
  
  if (!comments || comments.length === 0) return currentY;
  
  comments.forEach((comment, index) => {
    // 检查剩余空间
    if (currentY > canvasHeight - 150) return; // 留足够空间
    
    // 绘制评论卡片背景
    const cardHeight = drawCommentCard(ctx, comment, LAYOUT.padding, currentY, maxWidth);
    currentY += cardHeight + LAYOUT.content.spacing;
  });
  
  return currentY;
}

/**
 * 绘制单个评论卡片
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Object} comment - 评论数据
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {number} maxWidth - 最大宽度
 * @returns {number} 卡片高度
 */
function drawCommentCard(ctx, comment, x, y, maxWidth) {
  const cardPadding = 15;
  const contentWidth = maxWidth - cardPadding * 2;
  let contentHeight = cardPadding;
  
  // 计算内容高度
  setFont(ctx, FONTS.meta);
  const authorHeight = calculateLineHeight(FONTS.meta);
  
  setFont(ctx, FONTS.body);
  const content = comment.body_zh || comment.body;
  const commentLines = wrapText(ctx, cleanText(content), contentWidth, 4);
  const commentHeight = calculateTextHeight(commentLines, FONTS.body);
  
  contentHeight += authorHeight + 5 + commentHeight + cardPadding;
  
  // 绘制卡片背景和阴影
  drawShadow(ctx, x, y, maxWidth, contentHeight, 5);
  
  // 绘制作者信息
  let currentY = y + cardPadding;
  setFont(ctx, FONTS.meta);
  
  // 作者名
  drawText(ctx, comment.author, x + cardPadding, currentY, {
    color: COLORS.text.meta
  });
  
  // 点赞数
  const authorWidth = measureText(ctx, comment.author);
  drawUpvotes(ctx, comment.ups, x + cardPadding + authorWidth + 20, currentY - 2);
  
  currentY += authorHeight + 5;
  
  // 绘制评论内容
  setFont(ctx, FONTS.body);
  commentLines.forEach(line => {
    drawText(ctx, line, x + cardPadding, currentY, {
      color: COLORS.text.secondary
    });
    currentY += calculateLineHeight(FONTS.body);
  });
  
  return contentHeight;
}

/**
 * 绘制Footer信息
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {Object} pageData - 页面数据
 * @param {number} y - Y坐标
 */
function drawFooter(ctx, pageData, y) {
  const footerY = y;
  
  // 绘制分割线
  ctx.beginPath();
  ctx.moveTo(LAYOUT.padding, footerY);
  ctx.lineTo(CANVAS_CONFIG.width - LAYOUT.padding, footerY);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // 绘制点赞数
  if (pageData.ups !== undefined) {
    drawUpvotes(ctx, pageData.ups, LAYOUT.padding, footerY + 15);
  }
  
  // 绘制生成时间
  setFont(ctx, FONTS.small);
  const timestamp = new Date().toLocaleDateString('zh-CN');
  const timeText = `生成时间: ${timestamp}`;
  const timeWidth = measureText(ctx, timeText);
  
  drawText(ctx, timeText, CANVAS_CONFIG.width - LAYOUT.padding - timeWidth, footerY + 20, {
    color: COLORS.text.light
  });
}

/**
 * 根据页面类型选择对应的渲染函数
 * @param {Object} pageData - 页面数据
 * @returns {Canvas} 渲染完成的画布
 */
function renderCard(pageData) {
  console.log(`🎨 Rendering ${pageData.type} card...`);
  
  switch (pageData.type) {
    case 'main':
    case 'main_continued':
      return renderMainCard(pageData);
    case 'comments':
      return renderCommentCard(pageData);
    default:
      throw new Error(`Unknown card type: ${pageData.type}`);
  }
}

module.exports = {
  renderCard,
  renderMainCard,
  renderCommentCard
};

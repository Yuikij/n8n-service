/**
 * 文字处理工具函数
 * 包含自动换行、中英文混排、内容分页等功能
 */

/**
 * 检查字符是否为中文字符
 * @param {string} char - 字符
 * @returns {boolean} 是否为中文字符
 */
function isChinese(char) {
  return /[\u4e00-\u9fff]/.test(char);
}

/**
 * 检查字符是否为英文字符
 * @param {string} char - 字符
 * @returns {boolean} 是否为英文字符
 */
function isEnglish(char) {
  return /[a-zA-Z]/.test(char);
}

/**
 * 检查字符是否为标点符号
 * @param {string} char - 字符
 * @returns {boolean} 是否为标点符号
 */
function isPunctuation(char) {
  return /[,.!?;:，。！？；：、]/.test(char);
}

/**
 * 智能文本换行算法
 * 支持中英文混排，考虑单词完整性
 * @param {CanvasRenderingContext2D} ctx - 画布上下文
 * @param {string} text - 原始文本
 * @param {number} maxWidth - 最大宽度
 * @param {number} maxLines - 最大行数
 * @returns {Array<string>} 换行后的文本数组
 */
function wrapText(ctx, text, maxWidth, maxLines = Infinity) {
  if (!text || text.trim() === '') return [];
  
  const lines = [];
  const words = smartSplit(text);
  let currentLine = '';
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine !== '') {
      // 当前行已满，换行
      lines.push(currentLine.trim());
      
      // 检查是否超过最大行数
      if (lines.length >= maxLines) {
        // 截断并添加省略号
        const lastLine = lines[lines.length - 1];
        const ellipsis = '...';
        const ellipsisWidth = ctx.measureText(ellipsis).width;
        
        // 确保最后一行能容纳省略号
        let truncatedLine = lastLine;
        while (ctx.measureText(truncatedLine + ellipsis).width > maxWidth && truncatedLine.length > 0) {
          truncatedLine = truncatedLine.slice(0, -1);
        }
        lines[lines.length - 1] = truncatedLine + ellipsis;
        break;
      }
      
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  // 添加最后一行
  if (currentLine.trim() !== '' && lines.length < maxLines) {
    lines.push(currentLine.trim());
  }
  
  return lines;
}

/**
 * 智能文本分割
 * 考虑中英文混排的特点
 * @param {string} text - 原始文本
 * @returns {Array<string>} 分割后的词汇数组
 */
function smartSplit(text) {
  const result = [];
  let current = '';
  let lastType = null;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    let currentType;
    
    if (isChinese(char)) {
      currentType = 'chinese';
    } else if (isEnglish(char)) {
      currentType = 'english';
    } else if (char === ' ') {
      currentType = 'space';
    } else if (isPunctuation(char)) {
      currentType = 'punctuation';
    } else {
      currentType = 'other';
    }
    
    // 处理类型切换
    if (lastType && lastType !== currentType) {
      if (lastType === 'english' && currentType === 'space') {
        // 英文单词后的空格，继续累积
        current += char;
      } else if (lastType === 'space' && currentType === 'english') {
        // 空格后的英文，继续累积
        current += char;
      } else if (currentType === 'chinese') {
        // 切换到中文，结束当前词
        if (current.trim()) result.push(current);
        current = char;
      } else if (lastType === 'chinese') {
        // 从中文切换，结束当前词
        if (current.trim()) result.push(current);
        current = char;
      } else {
        current += char;
      }
    } else {
      current += char;
    }
    
    lastType = currentType;
    
    // 中文字符单独处理
    if (currentType === 'chinese' && current.length > 1) {
      result.push(current.slice(0, -1));
      current = char;
    }
  }
  
  if (current.trim()) {
    result.push(current);
  }
  
  return result.filter(word => word.trim() !== '');
}

/**
 * 计算文本行高
 * @param {Object} fontConfig - 字体配置
 * @returns {number} 行高
 */
function calculateLineHeight(fontConfig) {
  return fontConfig.size * 1.5; // 1.5倍行距
}

/**
 * 计算文本块的总高度
 * @param {Array<string>} lines - 文本行数组
 * @param {Object} fontConfig - 字体配置
 * @param {number} spacing - 行间距
 * @returns {number} 总高度
 */
function calculateTextHeight(lines, fontConfig, spacing = 0) {
  if (lines.length === 0) return 0;
  
  const lineHeight = calculateLineHeight(fontConfig);
  return lines.length * lineHeight + (lines.length - 1) * spacing;
}

/**
 * 截取指定长度的文本并添加省略号
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截取后的文本
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * 清理文本内容
 * 移除多余的空白字符和换行符
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\r\n/g, '\n')        // 统一换行符
    .replace(/\r/g, '\n')          // 统一换行符
    .replace(/\n+/g, '\n')         // 合并多个换行符
    .replace(/[ \t]+/g, ' ')       // 合并多个空格
    .trim();                       // 移除首尾空白
}

/**
 * 内容分页算法
 * 根据内容长度和复杂度智能分页
 * @param {Object} post - 帖子数据
 * @param {Object} options - 分页选项
 * @returns {Array<Object>} 分页后的内容数组
 */
function paginateContent(post, options = {}) {
  const {
    maxContentPerPage = 800,  // 每页最大字符数
    maxCommentsPerPage = 3,   // 每页最大评论数
    minPages = 2,             // 最小页数
    maxPages = 4              // 最大页数
  } = options;
  
  const pages = [];
  
  // 第一页：标题和正文
  const firstPage = {
    type: 'main',
    title: post.title,
    title_zh: post.title_zh || post.title_polish_zh,
    content: post.selftext,
    content_zh: post.selftext_zh,
    ups: post.ups,
    subreddit: post.subreddit,
    summary: post.summary_zh
  };
  pages.push(firstPage);
  
  // 处理评论分页
  if (post.commentList && post.commentList.length > 0) {
    const comments = post.commentList
      .filter(comment => comment.body && comment.body.trim() !== '')
      .sort((a, b) => b.ups - a.ups) // 按点赞数排序
      .slice(0, 12); // 最多显示12条评论
    
    // 将评论分组
    for (let i = 0; i < comments.length; i += maxCommentsPerPage) {
      const pageComments = comments.slice(i, i + maxCommentsPerPage);
      
      pages.push({
        type: 'comments',
        comments: pageComments,
        pageNumber: Math.floor(i / maxCommentsPerPage) + 1,
        title: post.title_zh || post.title_polish_zh || post.title
      });
      
      // 限制页数
      if (pages.length >= maxPages) break;
    }
  }
  
  // 确保最少页数
  while (pages.length < minPages && pages.length < maxPages) {
    if (pages[0].content && pages[0].content.length > maxContentPerPage) {
      // 长文本分页
      const mainContent = pages[0];
      const contentLength = mainContent.content.length;
      const midPoint = Math.floor(contentLength / 2);
      
      pages[0] = {
        ...mainContent,
        content: mainContent.content.slice(0, midPoint),
        content_zh: mainContent.content_zh ? mainContent.content_zh.slice(0, midPoint) : ''
      };
      
      pages.splice(1, 0, {
        type: 'main_continued',
        title: mainContent.title,
        title_zh: mainContent.title_zh,
        content: mainContent.content.slice(midPoint),
        content_zh: mainContent.content_zh ? mainContent.content_zh.slice(midPoint) : '',
        ups: mainContent.ups,
        subreddit: mainContent.subreddit
      });
    } else {
      break;
    }
  }
  
  return pages.slice(0, maxPages);
}

/**
 * 计算文本密度
 * 用于判断内容的信息密度
 * @param {string} text - 文本内容
 * @returns {number} 密度值 (0-1)
 */
function calculateTextDensity(text) {
  if (!text) return 0;
  
  const totalChars = text.length;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const punctuation = (text.match(/[,.!?;:，。！？；：]/g) || []).length;
  
  // 计算信息密度
  const informationScore = chineseChars * 1.2 + englishWords * 0.8 + punctuation * 0.3;
  const density = Math.min(informationScore / totalChars, 1);
  
  return density;
}

/**
 * 格式化时间戳
 * @param {number} timestamp - Unix时间戳
 * @returns {string} 格式化后的时间
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) {
    return '刚刚';
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

module.exports = {
  isChinese,
  isEnglish,
  isPunctuation,
  wrapText,
  smartSplit,
  calculateLineHeight,
  calculateTextHeight,
  truncateText,
  cleanText,
  paginateContent,
  calculateTextDensity,
  formatTimestamp
};

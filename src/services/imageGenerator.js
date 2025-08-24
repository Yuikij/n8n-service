/**
 * 图片生成服务
 * 负责协调模板渲染、内容分页和图片保存
 */

const path = require('path');
const { v4: uuidv4 } = require('uuid');

const htmlRenderer = require('./htmlRenderer');
const fs = require('fs').promises;
const { 
  ImageGenerationError, 
  FileSystemError, 
  retryOperation,
  ErrorLogger 
} = require('../utils/errorHandler');

const { getRenderer } = htmlRenderer;
const paginationService = require('./paginationService');

/**
 * 生成Reddit帖子的卡片图片
 * @param {Object} post - Reddit帖子数据
 * @param {Object} options - 生成选项
 * @returns {Promise<Object>} 生成结果
 */
async function generatePostCards(post, options = {}) {
  try {
    console.log(`🚀 Starting card generation for post: ${post.id}`);
    
    const {
      outputDir = path.join(__dirname, '../../public/images'),
      baseUrl = '',
      timestamp = Date.now()
    } = options;
    
    // 使用新的分页服务进行智能分页
    console.log(`🧠 Performing smart pagination for post: ${post.id}`);
    const pages = await paginationService.paginate(post);
    console.log(`📄 Content paginated into ${pages.length} pages using smart measurement.`);
    
    // 生成图片
    const results = [];
    const totalPages = pages.length;
    
    for (let i = 0; i < pages.length; i++) {
      const pageData = {
        ...pages[i],
        pageNumber: i + 1,
        totalPages: totalPages
      };
      const pageIndex = i + 1;
      
      console.log(`🎨 Rendering page ${pageIndex}/${totalPages} (${pageData.type})`);
      
      try {
        // 确定模板类型
        const templateName = pageData.type === 'main' || pageData.type === 'main_continued' 
          ? 'main-card' 
          : 'comment-card';
        
        // 渲染HTML为图片 - 使用重试机制
        const renderer = getRenderer();
        const imageBuffer = await retryOperation(async () => {
          return await renderer.renderCard(templateName, pageData, {
            width: 900,
            height: 1200,
            deviceScaleFactor: 2,
            quality: 90,
            autoHeight: true  // 启用自动高度计算
          });
        }, 2, 500);
        
        // 生成文件名
        const filename = `reddit_card_${post.id}_${timestamp}_${pageIndex}.png`;
        const filepath = path.join(outputDir, filename);
        
        // 保存图片 - 使用重试机制
        await retryOperation(async () => {
          // 确保目录存在
          await fs.mkdir(path.dirname(filepath), { recursive: true });
          await fs.writeFile(filepath, imageBuffer);
        }, 3, 1000);
        
        // 生成URL
        const imageUrl = baseUrl ? `${baseUrl}/images/${filename}` : `/images/${filename}`;
        
        results.push({
          filename,
          filepath,
          url: imageUrl,
          pageType: pageData.type,
          pageIndex
        });
        
        ErrorLogger.info(`Page generated successfully`, {
          postId: post.id,
          pageIndex,
          filename,
          pageType: pageData.type,
          templateName,
          imageSize: imageBuffer.length
        });
        
      } catch (error) {
        ErrorLogger.log(error, {
          postId: post.id,
          pageIndex,
          pageType: pageData.type
        });
        throw new ImageGenerationError(
          `Failed to generate page ${pageIndex}: ${error.message}`,
          post.id
        );
      }
    }
    
    console.log(`🎉 Successfully generated ${results.length} cards for post ${post.id}`);
    
    return {
      postId: post.id,
      images: results,
      totalPages: pages.length,
      generatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ Failed to generate cards for post ${post.id}:`, error);
    throw error;
  }
}

/**
 * 批量生成多个帖子的卡片
 * @param {Array<Object>} posts - Reddit帖子数据数组
 * @param {Object} options - 生成选项
 * @returns {Promise<Array<Object>>} 生成结果数组
 */
async function generateBatchCards(posts, options = {}) {
  console.log(`🚀 Starting batch generation for ${posts.length} posts`);
  
  const results = [];
  const errors = [];
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`\n📝 Processing post ${i + 1}/${posts.length}: ${post.id}`);
    
    try {
      const result = await generatePostCards(post, options);
      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to process post ${post.id}:`, error);
      errors.push({
        postId: post.id,
        error: error.message
      });
    }
  }
  
  console.log(`\n🎉 Batch generation completed:`);
  console.log(`   ✅ Successful: ${results.length}`);
  console.log(`   ❌ Failed: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Failed posts:`, errors);
  }
  
  return {
    successful: results,
    failed: errors,
    summary: {
      totalPosts: posts.length,
      successCount: results.length,
      failureCount: errors.length,
      totalImages: results.reduce((sum, result) => sum + result.images.length, 0)
    }
  };
}

/**
 * 验证帖子数据
 * @param {Object} post - 帖子数据
 * @returns {boolean} 验证结果
 */
function validatePostData(post) {
  const required = ['id', 'title', 'subreddit', 'created', 'ups', 'name'];
  
  for (const field of required) {
    if (!post[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // 验证数据类型
  if (typeof post.ups !== 'number') {
    throw new Error('ups must be a number');
  }
  
  if (typeof post.created !== 'number') {
    throw new Error('created must be a number');
  }
  
  // 验证评论数据
  if (post.commentList && Array.isArray(post.commentList)) {
    for (const comment of post.commentList) {
      if (!comment.author || !comment.body) {
        throw new Error('Comment missing required fields: author, body');
      }
      if (typeof comment.ups !== 'number') {
        throw new Error('Comment ups must be a number');
      }
    }
  }
  
  return true;
}

/**
 * 预处理帖子数据
 * 清理和标准化数据
 * @param {Object} post - 原始帖子数据
 * @returns {Object} 处理后的帖子数据
 */
function preprocessPostData(post) {
  // 验证数据
  validatePostData(post);
  
  // 清理文本内容
  const cleanedPost = {
    ...post,
    title: post.title,
    selftext: post.selftext || '',
    title_zh: post.title_zh || '',
    title_polish_zh: post.title_polish_zh || '',
    selftext_zh: post.selftext_zh || '',
    summary_zh: post.summary_zh || ''
  };
  
  // 处理评论数据
  if (cleanedPost.commentList && Array.isArray(cleanedPost.commentList)) {
    cleanedPost.commentList = cleanedPost.commentList
      .filter(comment => comment.body && comment.body.trim() !== '')
      .map(comment => ({
        ...comment,
        body: comment.body,
        body_zh: comment.body_zh || '',
        author: comment.author.trim()
      }))
      .sort((a, b) => b.ups - a.ups); // 按点赞数排序
  }
  
  return cleanedPost;
}

/**
 * 估算生成时间
 * @param {Array<Object>} posts - 帖子数据数组
 * @returns {Object} 时间估算
 */
function estimateGenerationTime(posts) {
  const avgTimePerCard = 2; // 秒
  const avgCardsPerPost = 3;
  
  const totalCards = posts.length * avgCardsPerPost;
  const estimatedSeconds = totalCards * avgTimePerCard;
  
  return {
    totalCards,
    estimatedSeconds,
    estimatedMinutes: Math.ceil(estimatedSeconds / 60),
    estimatedTime: formatDuration(estimatedSeconds)
  };
}

/**
 * 格式化持续时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间字符串
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分钟`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分钟`;
  }
}

/**
 * 获取生成统计信息
 * @param {Array<Object>} results - 生成结果数组
 * @returns {Object} 统计信息
 */
function getGenerationStats(results) {
  const totalImages = results.reduce((sum, result) => sum + result.images.length, 0);
  const avgImagesPerPost = totalImages / results.length;
  
  const cardTypes = {};
  results.forEach(result => {
    result.images.forEach(image => {
      cardTypes[image.pageType] = (cardTypes[image.pageType] || 0) + 1;
    });
  });
  
  return {
    totalPosts: results.length,
    totalImages,
    avgImagesPerPost: Math.round(avgImagesPerPost * 100) / 100,
    cardTypeDistribution: cardTypes,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generatePostCards,
  generateBatchCards,
  validatePostData,
  preprocessPostData,
  estimateGenerationTime,
  getGenerationStats
};

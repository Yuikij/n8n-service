const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

const imageGenerator = require('../services/imageGenerator');

const router = express.Router();

// 输入数据验证schema
const postSchema = Joi.object({
  id: Joi.string().required(),
  title: Joi.string().required(),
  title_polish_zh: Joi.string().allow(''),
  title_zh: Joi.string().allow(''),
  subreddit: Joi.string().required(),
  selftext: Joi.string().allow(''),
  selftext_zh: Joi.string().allow(''),
  created: Joi.number().required(),
  ups: Joi.number().required(),
  name: Joi.string().required(),
  summary_zh: Joi.string().allow(''),
  commentList: Joi.array().items(
    Joi.object({
      author: Joi.string().required(),
      body: Joi.string().required(),
      body_zh: Joi.string().allow(''),
      parent_id: Joi.string().allow(''),
      ups: Joi.number().required(),
      icon_img: Joi.string().allow('')
    })
  ).default([])
});

const requestSchema = Joi.object({
  postList: Joi.array().items(postSchema).min(1).required()
});

// POST /api/generate-cards - 生成Reddit卡片
router.post('/generate-cards', async (req, res) => {
  try {
    console.log(`📥 Received card generation request`);
    
    // 数据验证
    const { error, value } = requestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.details.map(d => d.message)
      });
    }

    const { postList } = value;
    console.log(`📊 Processing ${postList.length} posts`);

    // 生成时间估算
    const timeEstimate = imageGenerator.estimateGenerationTime(postList);
    console.log(`⏱️  Estimated generation time: ${timeEstimate.estimatedTime}`);

    // 预处理数据
    const processedPosts = postList.map(post => {
      try {
        return imageGenerator.preprocessPostData(post);
      } catch (error) {
        throw new Error(`Post ${post.id}: ${error.message}`);
      }
    });

    // 构造基础URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // 批量生成图片
    const batchResult = await imageGenerator.generateBatchCards(processedPosts, {
      baseUrl,
      timestamp: Date.now()
    });

    // 构造响应数据
    const results = batchResult.successful.map(result => ({
      postId: result.postId,
      imageUrls: result.images.map(img => img.url),
      imageCount: result.images.length
    }));

    const response = {
      success: true,
      data: {
        results,
        totalPosts: postList.length,
        totalImages: batchResult.summary.totalImages,
        generatedAt: new Date().toISOString()
      }
    };

    // 如果有失败的帖子，添加错误信息
    if (batchResult.failed.length > 0) {
      response.warnings = {
        failedPosts: batchResult.failed.length,
        failures: batchResult.failed
      };
    }

    // 添加统计信息
    if (batchResult.successful.length > 0) {
      response.stats = imageGenerator.getGenerationStats(batchResult.successful);
    }

    console.log(`🎉 Request completed: ${batchResult.summary.successCount}/${postList.length} posts processed`);
    
    res.json(response);

  } catch (error) {
    console.error('❌ Error in generate-cards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate cards',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/info - 获取服务信息
router.get('/info', (req, res) => {
  res.json({
    service: 'Reddit Card Generator',
    version: '1.0.0',
    description: 'Generate beautiful cards from Reddit posts and comments',
    endpoints: {
      'POST /api/generate-cards': 'Generate cards from Reddit post data',
      'GET /api/info': 'Get service information'
    },
    supportedFeatures: [
      '3:4竖版卡片生成',
      '中英文混排支持',
      '自动内容分页',
      '评论卡片生成',
      'Reddit样式设计'
    ]
  });
});

module.exports = router;

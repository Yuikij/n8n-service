/**
 * 内容分页服务
 * 使用Puppeteer精确测量内容高度并进行智能分页
 * v3.0 - 重构了分页算法，使用更稳健的二进制搜索
 */
const { getRenderer } = require('./htmlRenderer');

const MAIN_CONTENT_SELECTOR = '.main-content';
const COMMENTS_SECTION_SELECTOR = '.comments-section';

const MAX_HEIGHT_MAIN_CONTENT = 800;
const MAX_HEIGHT_COMMENTS = 900;  // 增加评论页面高度限制
const MAX_HEIGHT_SINGLE_COMMENT = 870;  // 增加单个评论高度限制

// --- Core Measurement ---

async function measureContentHeight(html, selector) {
    const renderer = getRenderer();
    const browser = await renderer.initBrowser();
    const page = await browser.newPage();
    
    // 使用更大的视口高度以避免限制内容测量
    await page.setViewport({ width: 900, height: 2000 });
    
    const cssPath = require('path').join(__dirname, '../templates/css/base.css');
    const cssContent = await require('fs').promises.readFile(cssPath, 'utf-8');
    const fullHTML = html.replace(
        '<link rel="stylesheet" href="../css/base.css">',
        `<style>${cssContent}</style>`
    );
    
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    try {
        const height = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) {
                console.error(`Element not found for selector: ${sel}`);
                return 0;
            }
            
            // 获取元素的实际高度
            const rect = element.getBoundingClientRect();
            const scrollHeight = element.scrollHeight;
            const clientHeight = element.clientHeight;
            const offsetHeight = element.offsetHeight;
            
            // 对于评论区域，还要考虑所有子元素的高度
            let totalChildrenHeight = 0;
            if (sel === '.comments-section') {
                const children = element.children;
                for (let i = 0; i < children.length; i++) {
                    const childRect = children[i].getBoundingClientRect();
                    totalChildrenHeight += childRect.height;
                }
                
                // 计算内边距和外边距
                const computedStyle = window.getComputedStyle(element);
                const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
                const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
                const marginTop = parseFloat(computedStyle.marginTop) || 0;
                const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
                
                totalChildrenHeight += paddingTop + paddingBottom + marginTop + marginBottom;
            }
            
            console.log(`Height measurement for ${sel}:`, {
                boundingRect: rect.height,
                scrollHeight,
                clientHeight,
                offsetHeight,
                totalChildrenHeight
            });
            
            // 使用最准确的高度值
            const measuredHeight = Math.max(rect.height, scrollHeight, offsetHeight, totalChildrenHeight);
            
            // 对于评论区域，如果测量值看起来不正确（比如太相似），使用子元素高度
            if (sel === '.comments-section' && totalChildrenHeight > 0 && 
                Math.abs(rect.height - scrollHeight) < 5 && totalChildrenHeight !== rect.height) {
                return totalChildrenHeight;
            }
            
            return measuredHeight;
        }, selector);
        
        console.log(`📐 Measured height for ${selector}: ${height}`);
        return height;
    } catch (error) {
        console.error(`Error measuring height for selector ${selector}:`, error);
        return 0;
    } finally {
        await page.close();
    }
}

// --- Main Content Pagination ---

async function paginateMainContent(post, pages) {
    const renderer = getRenderer();
    const paragraphs_zh = (post.selftext_zh || '').split('\n').filter(p => p.trim().length > 0);
    const paragraphs_en = (post.selftext || '').split('\n').filter(p => p.trim().length > 0);

    const basePageData = {
        title: post.title,
        title_zh: post.title_zh || post.title_polish_zh,
        ups: post.ups,
        subreddit: post.subreddit,
    };

    if (paragraphs_zh.length === 0 && paragraphs_en.length === 0) {
        pages.push({ ...basePageData, type: 'main' });
        return;
    }

    let remaining_zh = [...paragraphs_zh];
    let remaining_en = [...paragraphs_en];
    let isFirstPage = true;

    while (remaining_zh.length > 0 || remaining_en.length > 0) {
        let low = 1, high = Math.max(remaining_zh.length, remaining_en.length), best_fit_size = 0;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (mid === 0) { low = 1; continue; }

            const test_zh = remaining_zh.slice(0, mid);
            const test_en = remaining_en.slice(0, mid);

            const testPageData = { ...basePageData, type: 'main', content_zh: test_zh.join('\n'), content: test_en.join('\n') };
            const html = await renderer.renderHTML('main-card', testPageData);
            const height = await measureContentHeight(html, MAIN_CONTENT_SELECTOR);

            if (height > 0 && height <= MAX_HEIGHT_MAIN_CONTENT) {
                best_fit_size = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        if (best_fit_size === 0) {
            best_fit_size = 1;
        }

        const chunk_zh = remaining_zh.slice(0, best_fit_size);
        const chunk_en = remaining_en.slice(0, best_fit_size);

        pages.push({ 
            ...basePageData, 
            type: isFirstPage ? 'main' : 'main_continued', 
            content_zh: chunk_zh.join('\n'), 
            content: chunk_en.join('\n') 
        });

        isFirstPage = false;
        remaining_zh.splice(0, best_fit_size);
        remaining_en.splice(0, best_fit_size);
    }
}

// --- Comment Pagination ---

// 智能分割文本为段落
function smartSplitText(text) {
    if (!text) return [];
    
    // 首先按换行符分割
    let segments = text.split('\n').filter(p => p.trim().length > 0);
    
    // 如果段落太少但文本很长，进一步分割
    if (segments.length <= 2 && text.length > 500) {
        const newSegments = [];
        for (const segment of segments) {
            if (segment.length > 200) {
                // 按句子分割长段落
                const sentences = segment.split(/[。！？.!?]/).filter(s => s.trim().length > 0);
                if (sentences.length > 1) {
                    // 重新组合句子，每个分段包含适当数量的句子
                    let currentSegment = '';
                    for (const sentence of sentences) {
                        const potentialSegment = currentSegment + sentence + '。';
                        if (potentialSegment.length > 150 && currentSegment.length > 0) {
                            newSegments.push(currentSegment.trim());
                            currentSegment = sentence + '。';
                        } else {
                            currentSegment = potentialSegment;
                        }
                    }
                    if (currentSegment.trim().length > 0) {
                        newSegments.push(currentSegment.trim());
                    }
                } else {
                    newSegments.push(segment);
                }
            } else {
                newSegments.push(segment);
            }
        }
        segments = newSegments;
    }
    
    return segments;
}

async function splitComment(comment) {
    const renderer = getRenderer();
    const chunks = [];
    
    // 使用智能分割
    const pars_zh = smartSplitText(comment.body_zh || '');
    const pars_en = smartSplitText(comment.body || '');
    
    console.log(`🔍 Splitting comment from ${comment.author}: zh segments=${pars_zh.length}, en segments=${pars_en.length}`);

    let rem_zh = [...pars_zh];
    let rem_en = [...pars_en];
    let isFirstChunk = true;

    while (rem_zh.length > 0 || rem_en.length > 0) {
        let low = 1, high = Math.max(rem_zh.length, rem_en.length), best_fit_size = 0;

        // 二分查找最佳分割大小
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (mid === 0) { low = 1; continue; }

            const test_zh = rem_zh.slice(0, mid);
            const test_en = rem_en.slice(0, mid);
            const testComment = {
                ...comment,
                body_zh: test_zh.join('\n'),
                body: test_en.join('\n'),
                isContinuation: !isFirstChunk
            };
            
            const html = await renderer.renderHTML('comment-card', { comments: [testComment] });
            const height = await measureContentHeight(html, `.comments-section`);
            
            console.log(`📏 Testing comment chunk: segments=${mid}, height=${height}, limit=${MAX_HEIGHT_SINGLE_COMMENT}`);

            if (height > 0 && height <= MAX_HEIGHT_SINGLE_COMMENT) {
                best_fit_size = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // 确保至少取一个段落
        if (best_fit_size === 0) {
            if (rem_zh.length > 0 || rem_en.length > 0) {
                best_fit_size = 1;
                console.log(`⚠️  Force taking 1 segment due to size constraints`);
            } else {
                break;
            }
        }

        const chunk_zh = rem_zh.slice(0, best_fit_size);
        const chunk_en = rem_en.slice(0, best_fit_size);

        const chunk = {
            ...comment,
            body_zh: chunk_zh.join('\n'),
            body: chunk_en.join('\n'),
            isContinuation: !isFirstChunk
        };
        
        chunks.push(chunk);
        console.log(`✅ Created comment chunk ${chunks.length}: segments=${best_fit_size}, isContinuation=${!isFirstChunk}`);

        isFirstChunk = false;
        rem_zh.splice(0, best_fit_size);
        rem_en.splice(0, best_fit_size);
    }
    
    console.log(`📦 Comment from ${comment.author} split into ${chunks.length} chunks`);
    return chunks;
}

async function paginateComments(post, pages) {
    const renderer = getRenderer();
    const comments = post.commentList || [];
    if (comments.length === 0) {
        console.log(`📝 No comments found for post ${post.id}`);
        return;
    }

    console.log(`💬 Processing ${comments.length} comments for post ${post.id}`);
    let commentQueue = [];

    // 第一步：处理每个评论，长评论需要分割
    for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        console.log(`📖 Processing comment ${i + 1}/${comments.length} from ${comment.author}`);
        
        try {
            const html = await renderer.renderHTML('comment-card', { comments: [comment] });
            const height = await measureContentHeight(html, `.comments-section`);
            
            console.log(`📏 Comment height: ${height}, limit: ${MAX_HEIGHT_SINGLE_COMMENT}`);
            
            if (height > MAX_HEIGHT_SINGLE_COMMENT) {
                console.log(`✂️  Comment too tall, splitting...`);
                const chunks = await splitComment(comment);
                commentQueue.push(...chunks);
                console.log(`📦 Added ${chunks.length} chunks to queue`);
            } else {
                commentQueue.push(comment);
                console.log(`✅ Added comment directly to queue`);
            }
        } catch (error) {
            console.error(`❌ Error processing comment from ${comment.author}:`, error);
            // 即使出错也要添加评论，避免丢失内容
            commentQueue.push(comment);
        }
    }

    console.log(`🗂️  Total comment chunks in queue: ${commentQueue.length}`);

    // 第二步：将评论分组到页面中
    let pageIndex = 0;
    while (commentQueue.length > 0) {
        pageIndex++;
        let pageComments = [];
        console.log(`📄 Creating comment page ${pageIndex}, remaining chunks: ${commentQueue.length}`);

        while (commentQueue.length > 0) {
            const nextComment = commentQueue[0];
            const newPageComments = [...pageComments, nextComment];
            const pageData = { type: 'comments', comments: newPageComments, title: post.title_zh || post.title };
            
            try {
                const html = await renderer.renderHTML('comment-card', pageData);
                const height = await measureContentHeight(html, COMMENTS_SECTION_SELECTOR);
                
                console.log(`📏 Page height with ${newPageComments.length} comments: ${height}, limit: ${MAX_HEIGHT_COMMENTS}`);

                if (height > 0 && height <= MAX_HEIGHT_COMMENTS) {
                    pageComments.push(commentQueue.shift());
                    console.log(`✅ Added comment to page ${pageIndex}, page now has ${pageComments.length} comments`);
                } else {
                    console.log(`⛔ Page would be too tall, finalizing page ${pageIndex} with ${pageComments.length} comments`);
                    break;
                }
                
                // 安全检查：如果页面评论数量过多，强制分页
                if (pageComments.length >= 3) {
                    console.log(`⚠️  Page has reached maximum comment count (${pageComments.length}), forcing page break`);
                    break;
                }
            } catch (error) {
                console.error(`❌ Error measuring page height:`, error);
                break;
            }
        }

        // 如果页面为空但还有评论，强制添加一个评论
        if (pageComments.length === 0 && commentQueue.length > 0) {
            pageComments.push(commentQueue.shift());
            console.log(`⚠️  Force added 1 comment to avoid empty page`);
        }

        // 添加页面
        if (pageComments.length > 0) {
            pages.push({ 
                type: 'comments', 
                comments: pageComments, 
                title: post.title_zh || post.title 
            });
            console.log(`✅ Created comment page ${pageIndex} with ${pageComments.length} comments`);
        }
    }
    
    console.log(`📚 Comment pagination completed: ${pageIndex} comment pages created`);
}


// --- Main Entry Point ---

async function paginate(post) {
    console.log(`🚀 Starting pagination for post ${post.id}: "${post.title}"`);
    const pages = [];
    
    // 分页主内容
    console.log(`📄 Paginating main content...`);
    await paginateMainContent(post, pages);
    console.log(`✅ Main content pagination completed, current pages: ${pages.length}`);
    
    // 分页评论内容
    console.log(`💬 Paginating comments...`);
    await paginateComments(post, pages);
    console.log(`✅ Comment pagination completed, total pages: ${pages.length}`);

    // 如果没有任何页面，创建一个默认页面
    if (pages.length === 0) {
        console.log(`⚠️  No pages generated, creating default page`);
        pages.push({
            type: 'main',
            title: post.title,
            title_zh: post.title_zh || post.title_polish_zh,
            ups: post.ups,
            subreddit: post.subreddit,
        });
    }

    console.log(`🎉 Pagination completed for post ${post.id}: ${pages.length} total pages`);
    console.log(`📊 Page breakdown:`, pages.map((p, i) => `Page ${i + 1}: ${p.type}${p.comments ? ` (${p.comments.length} comments)` : ''}`));
    
    return pages;
}

module.exports = {
    paginate,
};
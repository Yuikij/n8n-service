/**
 * 内容分页服务
 * 使用Puppeteer精确测量内容高度并进行智能分页
 * v2.1 - 增加了对单条长评论的拆分逻辑
 */
const { getRenderer } = require('./htmlRenderer');

const MAIN_CONTENT_SELECTOR = '.main-content';
const COMMENTS_SECTION_SELECTOR = '.comments-section';

const MAX_HEIGHT_MAIN_CONTENT = 800;
const MAX_HEIGHT_COMMENTS = 880;
const MAX_HEIGHT_SINGLE_COMMENT = 850; // A single comment can take up slightly more space

// --- Core Measurement ---

async function measureContentHeight(html, selector) {
    const renderer = getRenderer();
    const browser = await renderer.initBrowser();
    const page = await browser.newPage();
    
    await page.setViewport({ width: 900, height: 1200 });
    
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
            return element ? element.getBoundingClientRect().height : 0;
        }, selector);
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
        let low = 1;
        let high = Math.max(remaining_zh.length, remaining_en.length);
        let bestFit = { zh: [], en: [] };

        while (low <= high) {
            const mid = Math.ceil((low + high) / 2);
            const test_zh = remaining_zh.slice(0, mid);
            const test_en = remaining_en.slice(0, mid);

            const testPageData = { ...basePageData, type: 'main', content_zh: test_zh.join('\n'), content: test_en.join('\n') };
            const html = await renderer.renderHTML('main-card', testPageData);
            const height = await measureContentHeight(html, MAIN_CONTENT_SELECTOR);

            if (height <= MAX_HEIGHT_MAIN_CONTENT) {
                bestFit = { zh: test_zh, en: test_en };
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        if (bestFit.zh.length === 0 && bestFit.en.length === 0) {
            bestFit = { zh: remaining_zh.slice(0, 1), en: remaining_en.slice(0, 1) };
        }

        pages.push({ 
            ...basePageData, 
            type: isFirstPage ? 'main' : 'main_continued', 
            content_zh: bestFit.zh.join('\n'), 
            content: bestFit.en.join('\n') 
        });

        isFirstPage = false;
        remaining_zh.splice(0, bestFit.zh.length);
        remaining_en.splice(0, bestFit.en.length);
    }
}

// --- Comment Pagination ---

async function splitComment(comment) {
    const renderer = getRenderer();
    const chunks = [];
    const pars_zh = (comment.body_zh || '').split('\n').filter(p => p.trim().length > 0);
    const pars_en = (comment.body || '').split('\n').filter(p => p.trim().length > 0);

    let rem_zh = [...pars_zh];
    let rem_en = [...pars_en];

    while (rem_zh.length > 0 || rem_en.length > 0) {
        let low = 1;
        let high = Math.max(rem_zh.length, rem_en.length);
        let bestFit = { zh: [], en: [] };

        while (low <= high) {
            const mid = Math.ceil((low + high) / 2);
            const test_zh = rem_zh.slice(0, mid);
            const test_en = rem_en.slice(0, mid);
            const testComment = { ...comment, body_zh: test_zh.join('\n'), body: test_en.join('\n') };
            const html = await renderer.renderHTML('comment-card', { comments: [testComment] });
            const height = await measureContentHeight(html, `.comments-section`);

            if (height <= MAX_HEIGHT_SINGLE_COMMENT) {
                bestFit = { zh: test_zh, en: test_en };
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        if (bestFit.zh.length === 0 && bestFit.en.length === 0) {
            bestFit = { zh: rem_zh.slice(0, 1), en: rem_en.slice(0, 1) };
        }

        chunks.push({ ...comment, body_zh: bestFit.zh.join('\n'), body: bestFit.en.join('\n'), isContinuation: (chunks.length > 0) });
        rem_zh.splice(0, bestFit.zh.length);
        rem_en.splice(0, bestFit.en.length);
    }
    return chunks;
}

async function paginateComments(post, pages) {
    const renderer = getRenderer();
    const comments = post.commentList || [];
    if (comments.length === 0) return;

    let commentQueue = [];

    for (const comment of comments) {
        const html = await renderer.renderHTML('comment-card', { comments: [comment] });
        const height = await measureContentHeight(html, `.comments-section`);
        if (height > MAX_HEIGHT_SINGLE_COMMENT) {
            const chunks = await splitComment(comment);
            commentQueue.push(...chunks);
        } else {
            commentQueue.push(comment);
        }
    }

    while (commentQueue.length > 0) {
        let low = 1;
        let high = commentQueue.length;
        let bestFit = [];

        while (low <= high) {
            const mid = Math.ceil((low + high) / 2);
            const testComments = commentQueue.slice(0, mid);
            const pageData = { type: 'comments', comments: testComments, title: post.title_zh || post.title };
            const html = await renderer.renderHTML('comment-card', pageData);
            const height = await measureContentHeight(html, COMMENTS_SECTION_SELECTOR);

            if (height <= MAX_HEIGHT_COMMENTS) {
                bestFit = testComments;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        if (bestFit.length === 0) {
            bestFit = commentQueue.slice(0, 1);
        }

        pages.push({ type: 'comments', comments: bestFit, title: post.title_zh || post.title });
        commentQueue.splice(0, bestFit.length);
    }
}

// --- Main Entry Point ---

async function paginate(post) {
    const pages = [];
    
    await paginateMainContent(post, pages);
    await paginateComments(post, pages);

    if (pages.length === 0) {
        pages.push({
            type: 'main',
            title: post.title,
            title_zh: post.title_zh || post.title_polish_zh,
            ups: post.ups,
            subreddit: post.subreddit,
        });
    }

    return pages;
}

module.exports = {
    paginate,
};
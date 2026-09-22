/**
 * 获取今日待学内容云函数
 *
 * 返回今日需要学习的新词（status=0）和待复习词（已到复习时间）两部分。
 * 各限制最多 100 个，避免单次返回过多数据影响前端渲染性能。
 * 新词和复习词分开查询并用两个 count 并行请求，方便前端展示各自数量。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { bookId } = event;

  if (!bookId) {
    return { code: 400, data: null, message: '缺少 bookId 参数' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // 分别并行 count 新词和复习词的数量。
    // 不合并查询是因为复习词有 nextReviewTime 范围条件，分开可让数据库利用不同索引。
    const [newCountRes, reviewCountRes] = await Promise.all([
      db.collection('user_progress')
        .where({ _openid: openid, bookId, status: 0 })
        .count()
        .catch(() => ({ total: 0 })),
      db.collection('user_progress')
        .where({ _openid: openid, bookId, status: db.command.gt(0), nextReviewTime: db.command.lte(now) })
        .count()
        .catch(() => ({ total: 0 }))
    ]);

    const newCount = newCountRes.total;
    const reviewCount = reviewCountRes.total;

    // 各取最多 100 条的进度数据。用独立 try/catch 包裹，
    // 防止因索引未创建导致分页查询失败时，至少还能返回计数信息让前端展示
    const BATCH = 100;
    let newProgress = [];
    let reviewProgress = [];

    try {
      if (newCount > 0) {
        for (let i = 0; i < Math.min(newCount, BATCH); i += 100) {
          const res = await db.collection('user_progress')
            .where({ _openid: openid, bookId, status: 0 })
            .skip(i).limit(100)
            .get();
          newProgress.push(...res.data);
        }
      }

      if (reviewCount > 0) {
        for (let i = 0; i < Math.min(reviewCount, BATCH); i += 100) {
          const res = await db.collection('user_progress')
            .where({ _openid: openid, bookId, status: db.command.gt(0), nextReviewTime: db.command.lte(now) })
            .skip(i).limit(100)
            .get();
          reviewProgress.push(...res.data);
        }
      }
    } catch (e) {
      // 降级策略：当复合索引未创建导致分页报错时，仅返回数量统计
      console.warn('[getTodayStudyWords] 分页查询失败，仅返回计数:', e.message);
    }

    // 收集所有需要查详情的 wordId，去重后批量查询单词表
    const newWordIds = newProgress.map(p => p.wordId);
    const reviewWordIds = reviewProgress.map(p => p.wordId);
    const allWordIds = [...new Set([...newWordIds, ...reviewWordIds])];

    let wordMap = {};
    if (allWordIds.length > 0) {
      for (let i = 0; i < allWordIds.length; i += BATCH) {
        const batch = allWordIds.slice(i, i + BATCH);
        const wordsResult = await db.collection('words')
          .where({ _id: db.command.in(batch) })
          .get();
        for (const w of wordsResult.data) {
          wordMap[w._id] = w;
        }
      }
    }

    return {
      code: 0,
      data: {
        newWords: newWordIds.map(id => ({
          ...wordMap[id],
          progress: newProgress.find(p => p.wordId === id) || {}
        })),
        reviewWords: reviewWordIds.map(id => ({
          ...wordMap[id],
          progress: reviewProgress.find(p => p.wordId === id) || {}
        })),
        newCount,
        reviewCount
      },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '获取今日学习内容失败' };
  }
};

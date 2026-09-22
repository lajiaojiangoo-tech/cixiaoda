/**
 * 初始化用户学习进度云函数
 *
 * 用户选择一本单词书后调用。先检查是否已有进度，避免重复初始化。
 * 支持增量补齐：如果词库新增了单词，只补缺失的部分而不影响已有进度。
 * 分批流式处理，避免一次性加载大量数据导致云函数超时。
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
    // 并行查询：已有进度数和词库总单词数，避免两次串行网络延迟
    const [existingCount, wordCountRes] = await Promise.all([
      db.collection('user_progress').where({ _openid: openid, bookId }).count(),
      db.collection('words').where({ bookId }).count()
    ]);
    const totalWords = wordCountRes.total;

    if (totalWords === 0) {
      return { code: 400, data: null, message: '词库中未找到该词书的单词，请先导入单词数据' };
    }
    if (existingCount.total >= totalWords) {
      // 进度记录数不少于词库单词数，说明已经初始化完毕
      return { code: 0, data: { alreadyInitialized: true, wordCount: totalWords }, message: '已初始化' };
    }

    if (existingCount.total > 0) {
      // 部分初始化：已有部分进度但词库扩充了，需要找出缺失的单词并补齐
      const existingSet = new Set();
      const BATCH = 100;
      for (let i = 0; i < existingCount.total; i += BATCH) {
        const res = await db.collection('user_progress')
          .where({ _openid: openid, bookId }).skip(i).limit(BATCH).get();
        res.data.forEach(p => existingSet.add(p.wordId));
      }

      // 遍历词库所有单词，找出尚未创建进度的单词
      const missingRecords = [];
      for (let i = 0; i < totalWords; i += BATCH) {
        const res = await db.collection('words').where({ bookId }).skip(i).limit(BATCH).get();
        for (const w of res.data) {
          if (!existingSet.has(w._id)) {
            missingRecords.push({
              _openid: openid, bookId, wordId: w._id,
              status: 0, testCount: 0, testCorrectCount: 0, nextReviewTime: null,
              createdAt: db.serverDate(), updatedAt: db.serverDate()
            });
          }
        }
      }

      // 批量写入缺失记录
      if (missingRecords.length > 0) {
        for (let i = 0; i < missingRecords.length; i += BATCH) {
          await Promise.all(missingRecords.slice(i, i + BATCH).map(r =>
            db.collection('user_progress').add({ data: r })
          ));
        }
      }
      return { code: 0, data: { repaired: missingRecords.length, wordCount: totalWords }, message: '补齐完成' };
    }

    // 全新初始化：从零开始，分批读取单词并创建进度记录
    let created = 0;
    const BATCH = 100;
    for (let i = 0; i < totalWords; i += BATCH) {
      const res = await db.collection('words').where({ bookId }).skip(i).limit(BATCH).get();
      const records = res.data.map(word => ({
        _openid: openid, bookId, wordId: word._id,
        status: 0, testCount: 0, testCorrectCount: 0, nextReviewTime: null,
        createdAt: db.serverDate(), updatedAt: db.serverDate()
      }));
      await Promise.all(records.map(r => db.collection('user_progress').add({ data: r })));
      created += records.length;
    }

    return { code: 0, data: { wordCount: created }, message: '初始化成功' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '初始化学习进度失败' };
  }
};

/**
 * 获取单词书列表云函数
 *
 * 支持分页和按名称模糊搜索。对每个已登录用户，会同时查出其对各本书的学习进度，
 * 方便前端直接展示每本书的已学/总数，避免前端再做二次聚合。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { keyword = '', page = 1, pageSize = 20 } = event;

  try {
    // 构建查询条件：keyword 为空时查全部，非空时按名称模糊匹配
    let query = {};
    if (keyword.trim()) {
      const reg = keyword.trim();
      query.name = db.RegExp({ regexp: reg, options: 'i' });
    }

    // 先查总数供前端分页组件使用
    const countResult = await db.collection('wordbooks').where(query).count();
    const total = countResult.total;

    // 分页拉取单词书列表，按单词量升序排列（从少到多，适合初学者优先展示）
    const skip = (page - 1) * pageSize;
    const bookResult = await db.collection('wordbooks')
      .where(query)
      .orderBy('totalWords', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get();

    const books = bookResult.data;

    // 只对已登录用户查进度；未登录用户只看书列表不展示进度
    const bookIds = books.map(b => b._id);
    let progressMap = {};
    if (openid && bookIds.length > 0) {
      const progressResult = await db.collection('user_progress')
        .where({
          _openid: openid,
          bookId: db.command.in(bookIds)
        })
        .get();

      // 遍历每本书的所有进度记录，统计已学（status>0）和总数
      for (const p of progressResult.data) {
        if (!progressMap[p.bookId]) {
          progressMap[p.bookId] = { learned: 0, total: 0 };
        }
        if (p.status > 0) progressMap[p.bookId].learned++;
        progressMap[p.bookId].total++;
      }
    }

    // 将进度合并到每本书的返回数据中
    const list = books.map(book => ({
      ...book,
      progress: progressMap[book._id] || { learned: 0, total: 0 }
    }));

    return {
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
        hasMore: skip + pageSize < total
      },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '获取单词书列表失败' };
  }
};

/**
 * 获取生词本列表云函数
 *
 * 支持按关键词搜索（匹配单词或释义）、按字母/时间排序、分页。
 * 由于 user_vocabulary 只存了 wordId，搜索时需要先查 words 表拿到匹配的 ID 列表，
 * 再以此为条件查询生词本。排序和分页在内存中完成，因为生词数量一般不会太大。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { keyword = '', sortBy = 'time', page = 1, pageSize = 20 } = event;

  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    // 构建生词本查询条件
    let vocabQuery = { _openid: openid };

    // 有关键词时，先去 words 表模糊匹配单词或释义，拿到匹配的 wordId 列表
    let wordIdFilter = [];
    if (keyword.trim()) {
      const reg = keyword.trim();
      const wordCount = await db.collection('words')
          .where(db.command.or([
            { word: db.RegExp({ regexp: reg, options: 'i' }) },
            { meaning: db.RegExp({ regexp: reg, options: 'i' }) }
          ]))
          .count();
      const BATCH = 100;
      let allWordResults = [];
      for (let j = 0; j < wordCount.total; j += BATCH) {
        const res = await db.collection('words')
          .where(db.command.or([
            { word: db.RegExp({ regexp: reg, options: 'i' }) },
            { meaning: db.RegExp({ regexp: reg, options: 'i' }) }
          ]))
          .skip(j).limit(BATCH).get();
        allWordResults.push(...res.data);
      }
      wordIdFilter = allWordResults.map(w => w._id);
      if (wordIdFilter.length === 0) {
        // 没有匹配的单词，直接返回空结果
        return {
          code: 0,
          data: { list: [], total: 0, page, pageSize, hasMore: false },
          message: 'ok'
        };
      }
      vocabQuery.wordId = db.command.in(wordIdFilter);
    }

    // 查询生词本记录总数
    const countResult = await db.collection('user_vocabulary')
      .where(vocabQuery)
      .count();
    const total = countResult.total;

    const skip = (page - 1) * pageSize;

    // 一次性拉取所有 user_vocabulary 记录（生词量一般不超过数千），在内存中排序和分页。
    // 这样避免了数据库不支持的自定义排序逻辑。
    const BATCH = 100;
    const vocabCount = await db.collection('user_vocabulary')
      .where(vocabQuery).count();
    let allVocabList = [];
    for (let j = 0; j < vocabCount.total; j += BATCH) {
      const res = await db.collection('user_vocabulary')
        .where(vocabQuery).skip(j).limit(BATCH).get();
      allVocabList.push(...res.data);
    }

    // 查询所有关联的单词详情，去重后批量读取
    const allWordIds = allVocabList.map(v => v.wordId);
    let wordMap = {};
    if (allWordIds.length > 0) {
      const uniqueIds = [...new Set(allWordIds)];
      for (let i = 0; i < uniqueIds.length; i += BATCH) {
        const batch = uniqueIds.slice(i, i + BATCH);
        const wordsResult = await db.collection('words')
          .where({ _id: db.command.in(batch) })
          .get();
        for (const w of wordsResult.data) {
          wordMap[w._id] = w;
        }
      }
    }

    // 组装：合并生词本记录和单词详情
    let allList = allVocabList.map(v => ({
      ...wordMap[v.wordId],
      vocabId: v._id,
      addedAt: v.addedAt
    }));

    // 在内存中排序
    if (sortBy === 'alpha') {
      // 按单词字母顺序升序
      allList.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
    } else {
      // 默认按添加时间降序（最新的在前）
      allList.sort((a, b) => {
        const tA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const tB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return tB - tA;
      });
    }

    // 手动分页
    const list = allList.slice(skip, skip + pageSize);
    const hasMore = skip + pageSize < total;

    return {
      code: 0,
      data: { list, total, page, pageSize, hasMore },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '获取生词本失败' };
  }
};

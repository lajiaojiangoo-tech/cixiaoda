/**
 * 根据 ID 列表批量查询单词详情云函数
 *
 * 供测试页等场景使用：前端传入一组 wordId，返回对应的完整单词信息。
 * 分批查询以规避云数据库 in 操作符的单次上限。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { ids } = event;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return { code: 400, data: null, message: '缺少单词 ID 列表' };
  }

  try {
    const words = [];
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const res = await db.collection('words').where({
        _id: db.command.in(batch)
      }).get();
      words.push(...res.data);
    }

    return { code: 0, data: words, message: 'ok' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '查询失败' };
  }
};

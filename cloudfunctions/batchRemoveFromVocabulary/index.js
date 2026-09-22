/**
 * 批量从生词本移除单词云函数
 *
 * 一次性处理多个 wordId，分批查询和删除以免触及云数据库单次操作上限。
 * 找到一条删一条，返回实际移除的数量供前端确认。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { wordIds } = event;

  if (!wordIds || !Array.isArray(wordIds) || wordIds.length === 0) {
    return { code: 400, data: null, message: '缺少 wordIds 参数' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    let removed = 0;
    const BATCH = 100;

    // 分批查询，每批最多查 100 个 wordId（云数据库 in 查询上限）
    for (let i = 0; i < wordIds.length; i += BATCH) {
      const batch = wordIds.slice(i, i + BATCH);
      const res = await db.collection('user_vocabulary')
        .where({
          _openid: openid,
          wordId: db.command.in(batch)
        })
        .get();

      // 并行删除该批次中找到的所有记录
      if (res.data.length > 0) {
        await Promise.all(res.data.map(doc =>
          db.collection('user_vocabulary').doc(doc._id).remove()
        ));
        removed += res.data.length;
      }
    }

    return { code: 0, data: { removed }, message: `已移除 ${removed} 个单词` };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '批量移出生词本失败' };
  }
};

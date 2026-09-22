/**
 * 同步用户设置云函数
 *
 * 仅保存白名单内的字段，防止客户端传入脏数据覆盖意外字段。
 * 使用 upsert 语义：已有记录则更新，没有则新建。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  const { settings } = event;
  if (!settings || typeof settings !== 'object') {
    return { code: 400, data: null, message: '参数错误' };
  }

  // 白名单机制：只写入明确允许的字段，避免客户端篡改不应由用户直接控制的配置项
  const allowedFields = ['dailyNewWords'];
  const sanitized = {};
  for (const key of allowedFields) {
    if (settings[key] !== undefined) {
      sanitized[key] = settings[key];
    }
  }

  try {
    let existing;
    try {
      existing = await db.collection('user_settings').where({
        _openid: openid
      }).get();
    } catch (e) {
      // 集合未创建时给出明确指引，而不是静默失败
      return { code: -1, data: null, message: 'user_settings 集合不存在，请在云开发控制台创建' };
    }

    let saved;
    if (existing.data.length > 0) {
      // 已有记录：只更新白名单字段，保留其他字段不变
      await db.collection('user_settings').doc(existing.data[0]._id).update({
        data: {
          ...sanitized,
          updatedAt: db.serverDate()
        }
      });
      saved = { ...sanitized, updatedAt: db.serverDate() };
    } else {
      // 新用户：完整创建记录
      const addResult = await db.collection('user_settings').add({
        data: {
          _openid: openid,
          ...sanitized,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      saved = { _id: addResult._id, ...sanitized };
    }

    return { code: 0, data: saved, message: 'ok' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '同步设置失败' };
  }
};

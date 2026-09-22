/**
 * 获取用户数据云函数
 *
 * 聚合返回用户设置和总学习进度，供首页初始化时一次性渲染。
 * 两个集合用 try/catch 分别包裹，保证即使某集合不存在也不阻塞整体返回。
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

  try {
    let userSettingsData = null;
    try {
      const userSettings = await db.collection('user_settings').where({
        _openid: openid
      }).get();
      userSettingsData = userSettings.data[0] || null;
    } catch (e) {
      // user_settings 集合可能尚未在云开发控制台创建，静默跳过以免影响首页加载
      console.warn('[getUserData] user_settings 集合不可用:', e.message);
    }

    let totalProgress = 0;
    try {
      const userProgress = await db.collection('user_progress').where({
        _openid: openid
      }).count();
      totalProgress = userProgress.total || 0;
    } catch (e) {
      console.warn('[getUserData] user_progress 集合不可用:', e.message);
    }

    return {
      code: 0,
      data: {
        settings: userSettingsData,
        totalProgress
      },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '获取用户数据失败' };
  }
};

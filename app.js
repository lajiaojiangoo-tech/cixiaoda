const cloudApi = require('./utils/cloud');

App({
  globalData: {
    userInfo: null,
    openid: null
  },

  onLaunch() {
    wx.cloud.init({
      env: wx.cloud.DYNAMIC_CURRENT_ENV,
      traceUser: true
    });

    // 获取用户 openid 并保存
    cloudApi.login().then(res => {
      if (res && res.openid) {
        this.globalData.openid = res.openid;
      }
    }).catch(() => {});
  }
});

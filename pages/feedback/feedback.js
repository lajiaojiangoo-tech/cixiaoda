const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

Page({
  data: {
    formType: '建议',
    formContent: '',
    formContact: '',
    contentLength: 0,
    submitting: false,
    errorMsg: ''
  },

  onTypeChange(e) {
    this.setData({ formType: e.detail.value, errorMsg: '' });
  },

  onContentInput(e) {
    const content = e.detail.value;
    this.setData({
      formContent: content,
      contentLength: content.length,
      errorMsg: ''
    });
  },

  onContactInput(e) {
    this.setData({ formContact: e.detail.value });
  },

  async onSubmit(e) {
    if (this.data.submitting) return;

    // 表单验证
    const { formType, formContent, formContact } = this.data;

    if (!formContent || formContent.trim().length < 5) {
      this.setData({ errorMsg: '反馈内容不能少于5个字' });
      return;
    }

    if (!formType) {
      this.setData({ errorMsg: '请选择反馈类型' });
      return;
    }

    this.setData({ submitting: true, errorMsg: '' });

    try {
      await cloudApi.addFeedback({
        type: formType,
        content: formContent.trim(),
        contact: formContact.trim()
      });

      util.showToast('感谢您的反馈！', 'success');
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('[feedback] 提交失败:', err);
      this.setData({
        errorMsg: err.message || '提交失败，请稍后重试',
        submitting: false
      });
    }
  }
});

/**
 * 词小达（WordWise）云开发环境配置说明
 *
 * ===== 数据库集合列表 =====
 *
 * 1. wordbooks        - 单词书
 * 2. words            - 单词
 * 3. user_progress    - 用户学习进度
 * 4. user_vocabulary  - 用户生词本
 * 5. study_records    - 学习记录
 * 6. feedbacks        - 用户反馈
 * 7. user_settings    - 用户设置
 *
 * ===== ⚠️ 重要：必须先创建数据库集合 =====
 *
 * 以下 7 个集合必须在云开发控制台手动创建，否则所有云函数会报错：
 *
 * 在微信开发者工具中：
 *   1. 点击左上角「云开发」按钮
 *   2. 进入「数据库」标签
 *   3. 依次创建以上 7 个集合（选择「默认权限」即可）
 *   4. 进入 user_progress 集合 → 「索引管理」→ 添加复合索引：
 *      - _openid: 升序, bookId: 升序, status: 升序
 *   5. 进入 study_records 集合 → 添加索引：
 *      - _openid: 升序, date: 升序
 *
 * ===== 部署步骤 =====
 *
 * 1. 创建以上 7 个数据库集合
 * 2. 右键 cloudfunctions/initDatabase → 上传并部署 → 调用一次（参数 step=all）
 * 3. 右键 cloudfunctions/ 下的每个云函数 → 上传并部署
 * 4. 验证：调用 getUserData 云函数，返回 code:0 即正常
 *
 * ===== 权限配置 =====
 *
 * 所有集合默认权限：仅创建者可读写
 * feedbacks 集合额外开启：所有用户可写（用于匿名反馈）
 *
 * ===== 云函数列表 =====
 *
 * initDatabase      - 初始化数据库（创建示例单词书和单词数据）
 * login             - 获取用户 openid
 * getUserData       - 获取用户设置与进度概览
 * syncUserSettings  - 同步用户设置
 * getWordbooks      - 分页获取单词书列表
 * getWordsByBook    - 按单词书获取单词列表
 * initUserProgress  - 初始化用户学习进度
 * updateWordStatus  - 更新单词学习状态
 * getTodayStudyWords - 获取今日待学/待复习词
 * submitTestResult  - 提交测试结果
 * addToVocabulary   - 加入生词本
 * removeFromVocabulary - 移出生词本
 * getVocabularyList - 获取生词本列表
 * getStudyRecords   - 获取学习日历数据
 * getStatistics     - 获取学习统计
 * addFeedback       - 提交反馈
 * batchSyncProgress - 批量同步进度
 */

/** 接口薄封装（A01–A32），与后端 app/api/v1 路由一一对应 */
const { request } = require('./request')

module.exports = {
  /* 认证 */
  wechatLogin: (code, extra) =>
    request({ url: '/auth/wechat-login', method: 'POST', data: { code, ...(extra || {}) }, auth: false }),
  getMe: () => request({ url: '/users/me' }),

  /* 用户与资料 */
  saveProfile: data => request({ url: '/users/me/profile', method: 'PUT', data }),
  getBodyProfile: () => request({ url: '/users/me/body-profile' }),
  saveBodyProfile: data => request({ url: '/users/me/body-profile', method: 'PUT', data }),
  getCompleteness: () => request({ url: '/users/me/completeness' }),
  getUser: id => request({ url: '/users/' + id }),
  getUserPosts: (id, page, size) =>
    request({ url: '/users/' + id + '/posts', data: { page, size } }),

  /* 社区 */
  getFeed: (type, cursor, size) => request({ url: '/feed', data: { type, cursor, size } }),
  getPost: id => request({ url: '/posts/' + id }),
  createPost: data => request({ url: '/posts', method: 'POST', data }),
  deletePost: id => request({ url: '/posts/' + id, method: 'DELETE' }),
  likePost: (id, on) =>
    request({ url: '/posts/' + id + '/like', method: on ? 'POST' : 'DELETE' }),
  collectPost: (id, on) =>
    request({ url: '/posts/' + id + '/collect', method: on ? 'POST' : 'DELETE' }),
  getComments: (id, cursor, size) =>
    request({ url: '/posts/' + id + '/comments', data: { cursor, size } }),
  addComment: (id, content, replyToId) =>
    request({ url: '/posts/' + id + '/comments', method: 'POST', data: { content, replyToId } }),
  /** A34 评论点赞 / 取消（1.0） */
  likeComment: (commentId, on) =>
    request({ url: '/comments/' + commentId + '/like', method: on ? 'POST' : 'DELETE' }),
  /** A35 删除自己的评论（1.0） */
  deleteComment: commentId => request({ url: '/comments/' + commentId, method: 'DELETE' }),

  /* 话题 */
  getHotTopics: limit => request({ url: '/topics/hot', data: { limit } }),
  getTopics: (page, size) => request({ url: '/topics', data: { page, size } }),
  getTopic: id => request({ url: '/topics/' + id }),
  getTopicPosts: (id, sort, cursor) =>
    request({ url: '/topics/' + id + '/posts', data: { sort, cursor } }),
  searchTopics: q => request({ url: '/topics/search', data: { q } }),
  createTopic: name => request({ url: '/topics', method: 'POST', data: { name } }),

  /* 课程 */
  getCourses: params => request({ url: '/courses', data: params || {} }),
  getCourse: id => request({ url: '/courses/' + id }),
  collectCourse: (id, on) =>
    request({ url: '/courses/' + id + '/collect', method: on ? 'POST' : 'DELETE' }),

  /* 产品 */
  getProducts: category => request({ url: '/products', data: { category } }),
  getProduct: id => request({ url: '/products/' + id }),
  collectProduct: (id, on) =>
    request({ url: '/products/' + id + '/collect', method: on ? 'POST' : 'DELETE' }),

  /* 收藏与搜索 */
  getFavorites: (type, page, size) =>
    request({ url: '/users/me/favorites', data: { type, page, size } }),
  search: (q, type, page) => request({ url: '/search', data: { q, type, page } }),

  /* 关注 */
  follow: (userId, on) => request({ url: '/follows/' + userId, method: on ? 'POST' : 'DELETE' })
}

/** 全局常量与枚举（与 04/05 文档字段严格一致） */

const ROUTES = {
  community: '/pages/community/index',
  mine: '/pages/mine/index',
  login: '/packageCommon/pages/login/login',
  search: '/packageCommon/pages/search/search',
  topics: '/packageCommunity/pages/topics/topics',
  topicDetail: '/packageCommunity/pages/topic-detail/topic-detail',
  post: '/packageCommunity/pages/post/post',
  publish: '/packageCommunity/pages/publish/publish',
  publishResult: '/packageCommunity/pages/publish-result/publish-result',
  userProfile: '/packageCommunity/pages/user-profile/user-profile',
  courseDetail: '/packageCourse/pages/detail/detail',
  coursePlay: '/packageCourse/pages/play/play',
  productDetail: '/packageProduct/pages/detail/detail',
  profile: '/packageMine/pages/profile/profile',
  profileEdit: '/packageMine/pages/profile-edit/profile-edit',
  bodyProfile: '/packageMine/pages/body-profile/body-profile',
  favorites: '/packageMine/pages/favorites/favorites',
  settings: '/packageMine/pages/settings/settings'
}

const POST_STATUS = { PUBLISHED: 'published', REVIEWING: 'reviewing', DELETED: 'deleted' }
const VISIBILITY = { PUBLIC: 'public', FOLLOWERS: 'followers' }
const GENDER = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '保密', value: 'secret' }
]
const GOALS = [
  { label: '减脂', value: 'fat_loss' },
  { label: '增肌', value: 'muscle' },
  { label: '运动恢复', value: 'recovery' },
  { label: '体态改善', value: 'posture' },
  { label: '术后康复', value: 'post_op' },
  { label: '提升耐力', value: 'endurance' }
]
const FREQUENCY = [
  { label: '1-2 次/周', value: '1-2' },
  { label: '3-4 次/周', value: '3-4' },
  { label: '5 次以上/周', value: '5+' },
  { label: '不规律', value: 'irregular' }
]
const LEVELS = [
  { label: '新手', value: 'beginner', desc: '刚开始运动' },
  { label: '进阶', value: 'intermediate', desc: '规律训练 3 个月以上' },
  { label: '高手', value: 'advanced', desc: '每周 4 次以上' }
]
const FOCUS_PARTS = [
  { label: '肩颈', value: 'neck_shoulder' },
  { label: '下背', value: 'lower_back' },
  { label: '髋部', value: 'hip' },
  { label: '膝盖', value: 'knee' },
  { label: '小腿', value: 'calf' },
  { label: '足部', value: 'foot' }
]
const COURSE_CATEGORIES = [
  { label: '全部', value: 'all' },
  { label: '康复训练', value: 'rehab' },
  { label: '放松恢复', value: 'recovery' },
  { label: '体态改善', value: 'posture' },
  { label: '拉伸舒展', value: 'stretch' }
]
const PRODUCT_CATEGORIES = [
  { label: '全部', value: 'all' },
  { label: '运动康复', value: 'rehab' },
  { label: '运动恢复', value: 'recovery' },
  { label: '便携设备', value: 'portable' }
]
const FAVORITE_TYPES = [
  { label: '社区', value: 'post' },
  { label: '课程', value: 'course' },
  { label: '产品', value: 'product' }
]
const FEED_TYPES = [
  { label: '推荐', value: 'recommend' },
  { label: '关注', value: 'follow' },
  { label: '最新', value: 'latest' }
]

module.exports = {
  ROUTES,
  POST_STATUS,
  VISIBILITY,
  GENDER,
  GOALS,
  FREQUENCY,
  LEVELS,
  FOCUS_PARTS,
  COURSE_CATEGORIES,
  PRODUCT_CATEGORIES,
  FAVORITE_TYPES,
  FEED_TYPES
}

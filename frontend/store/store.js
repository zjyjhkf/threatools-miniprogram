/** 极简响应式 store（约 40 行），跨页共享只走这里 */
function createStore(initial) {
  let state = Object.assign({}, initial)
  const subs = []

  function emit() {
    subs.slice().forEach(fn => {
      try {
        fn(state)
      } catch (e) {}
    })
  }

  return {
    get() {
      return state
    },
    set(patch) {
      state = Object.assign({}, state, patch)
      emit()
    },
    watch(fn) {
      subs.push(fn)
      return fn
    },
    unwatch(fn) {
      const i = subs.indexOf(fn)
      if (i >= 0) subs.splice(i, 1)
    }
  }
}

const ui = createStore({
  tab: 0,
  visited: [true, false, false],
  pendingAction: null,
  loginJustNow: false
})

const user = createStore({
  token: '',
  isLogin: false,
  profile: null,
  completeness: { filled: 0, total: 7, missing: [] }
})

const feed = createStore({
  lists: { recommend: [], follow: [], myworks: [] }
})

module.exports = { createStore, ui, user, feed }

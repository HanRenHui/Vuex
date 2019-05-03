let Vue

class ModuleCollection {
  constructor(options) { // [a, b] 表明a中有b 如果是个空数组 则表示是根 
    // 注册模块 
    this.register([], options)
  }
  register(path, rawModule) {
    // path是个空数组 rawModule是个对象
    let newModule = {
      _raw: rawModule, // 对象 有state getters那个对象
      _children: {}, // 用来表示自己的子模块
      state: rawModule.state // 用来表示自己模块的状态
    }
    // 如果是空数组 也就是根的话
    if (path.length === 0) {
      this.root = newModule
    } else {
      // 如果不是根的话 
      // 去掉最后一项
      let parent = path.slice(0, -1).reduce((root, current) => {
        return root._children[current]
      }, this.root)
      parent._children[path[path.length - 1]] = newModule
    }

    if (rawModule.modules) { // 有子模块
      forEach(rawModule.modules, (childName, module) => {
        this.register(path.concat(childName), module)
      })
    }
  }
}

function install(_Vue) {
  // 防止多次use
  if (Vue) return
  Vue = _Vue
  Vue.mixin({
    beforeCreate() {
      if (this.$options.store) {
        // 是根实例
        this.$store = this.$options && this.$options.store
      } else {
        // 不是
        this.$store = this.$parent && this.$parent.$options.store
      }
    }
  })
}

function installModule(store, rootState, path, rootModule) {
  // 处理state 按照模块添加
  if (path.length > 0) { // [a, b, c]
    let parent = path.slice(0, -1).reduce((root, current) => {
      return root[current]
    }, rootState)
    Vue.set(parent, path[path.length -1], rootModule.state)
  }
  // 处理getters
  if (rootModule._raw.getters) {
    forEach(rootModule._raw.getters, (getterName, getterFn) => {
      // getters 无论是哪个模块上的都直接添加在store的getters上
      Object.defineProperty(store.getters, getterName, {
        get() {
          return getterFn(rootModule.state)
        }
      })
    })
  }
  // actions 和 mutations也一样不分模块全部放在一起 重名不会覆盖 会全部执行
  if (rootModule._raw.actions) {

    forEach(rootModule._raw.actions, (actionName, actionFn) => {
      let entry = store.actions[actionName] || (store.actions[actionName] = [])
      entry.push((...params) => {
        actionFn.call(store, store, ...params)
      })
    })
  }
  if (rootModule._raw.mutations) {
    forEach(rootModule._raw.mutations, (mutationName, mutationFn) => {
      let entry = store.mutations[mutationName] || (store.mutations[mutationName] = [])
      entry.push((...params) => {
        mutationFn.call(store, rootState, ...params)
      })
    })
  }
  if (rootModule._children) {
    forEach(rootModule._children, (childName, module) => {
      console.log(module);
      
      installModule(store, rootState, path.concat(childName), module)
    })
  }
}

class Store {
  constructor(options) {
    let state = options.state || {}
    this.getters = {}
    this.mutations = {}
    this.actions = {}
    this._vm = new Vue({
      data: {
        state
      }
    })
    // 把模块之间的关系进行整理
    this.modules = new ModuleCollection(options) // {_raw: {}, _children: {a: {_raw...}}}
    console.log(this.modules);
    
    installModule(this, state, [], this.modules.root)

    let { commit, dispatch } = this
    // 覆盖内部commit和dispatch 从而解决this指向问题
    this.commit = (type, ...rest) => {
      commit.call(this, type, ...rest)
    }
    this.dispatch = (type, ...rest) => {
      dispatch.call(this, type, ...rest)
    }
  }
  get state() {
    return this._vm.state
  }
  commit(type, ...rest) {
    // this.mutations[type](...rest)
    this.mutations[type].forEach(m => m(...rest))
  }
  dispatch(type, ...rest) {
    // this.actions[type](...rest)
    this.actions[type].forEach(a => a(...rest))
  }
}

function forEach(getters, callback) {
  for (let key in getters) {
    callback(key, getters[key])
  }
}

export default {
  Store,
  install
}
/* eslint-disable no-extend-native */
// 静态变量 停止信号
const STOP_SIGNAL = {}

// 为Promise注入静态方法 stop
// 实质是返回一下携带停止信号的 Promise.resolve
Object.defineProperty(Promise, 'stop', {
  writable: false,
  enumerable: false,
  configurable: true,
  value: function(data) {
    return Promise.resolve({
      signal: STOP_SIGNAL,
      value: data,
    })
  }
})

// 为Promise注入实例方法 next
// 实质是调用then方法，检测是否包含停止信号，决定是否执行onResolved
Promise.prototype.next = function(onResolved, onRejected) {
  return this.then(data => {
    if (Array.isArray(data)) {
      // 如果data是数组，说明使用了Promise.all 或 race
      // 目前 对Promise.all Promise.race 不支持whenStop方式，
      // 但如果使用all来调用使用的stop的promise，会出现数据污染
      // 那么对于使用了Promise.stop后需要做解包处理
      // 去掉里面的signal字段
      // 另外，如果使用all调用含stop的promise则必须使用next解包，
      // 使用then会有数据污染
      // 污染后的数据格式为data:{single,value}，其中value是真实的值
      return onResolved(data.map(item => {
        if ('signal' in item) {
          return item.value
        }
        return item
      }))
    }
    if (data && data.signal && data.signal === STOP_SIGNAL) {
      return data
    } else {
      return onResolved(data)
    }
  }, onRejected)
}

// 为Promise注入实例方法 whenStop
// 实质是调用then方法，检测是否包含停止信号，决定是否执行onResolved
Promise.prototype.whenStop = function(onResolved, onRejected) {
  return this.then(data => {
    if (data && data.signal && data.signal === STOP_SIGNAL) {
      return onResolved(data.value)
    } else {
      return data
    }
  }, onRejected)
}

/* eslint-enable no-extend-native */

